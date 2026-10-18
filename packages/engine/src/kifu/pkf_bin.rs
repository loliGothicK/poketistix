use crate::kifu::{
    ActionQuality, BattleKifu, EventProvenance, MatchOutcome, ObservedEvent, ObservedHp,
    OpponentPreviewSlot, TurnAnnotation, TurnRecord,
};
use crate::sim::pokemon::PokemonIdent;
use crate::wasm_api::{Boosts, InputPokemonData, PlayerActionJs, PokemonEvs, SlotActionJs};
use pkmn_meta::Regulation;
use std::collections::HashMap;

const PKF_MAGIC: &[u8; 4] = b"PKF\x01";

const FLAG_OTS: u8 = 0x01;
const FLAG_LEAD_TIMESTAMP: u8 = 0x02;
const FLAG_U16_STR_INDEX: u8 = 0x10;

// Event opcodes (matching pkf_pbn_specification.md)
const OP_SWITCH_IN: u8 = 0x01;
const OP_MEGA_EVOLVE: u8 = 0x02;
const OP_MOVE_USED: u8 = 0x03;
const OP_DAMAGE: u8 = 0x04;
const OP_HEAL: u8 = 0x05;
const OP_ABILITY_TRIGGERED: u8 = 0x06;
const OP_ITEM_TRIGGERED: u8 = 0x07;
const OP_STAT_STAGE_CHANGED: u8 = 0x08;
const OP_STATUS_CHANGED: u8 = 0x09;
const OP_WEATHER_CHANGED: u8 = 0x0A;
const OP_TERRAIN_CHANGED: u8 = 0x0B;
const OP_FIELD_COND_CHANGED: u8 = 0x0C;
const OP_SIDE_COND_CHANGED: u8 = 0x0D;
const OP_FAINT: u8 = 0x0E;
const OP_PROVENANCE_BIT: u8 = 0x80;

impl BattleKifu {
    /// `.pkf` バイナリ形式へシリアライズする
    pub fn to_pkf_bytes(&self) -> Vec<u8> {
        let mut stab = StringTableBuilder::new();

        // Pre-intern all strings
        for p in &self.p1_team {
            stab.intern(&p.ident);
            stab.intern(&p.species);
            stab.intern_opt(p.item.as_deref());
            stab.intern_opt(p.ability.as_deref());
            stab.intern(&p.type1);
            stab.intern_opt(p.type2.as_deref());
            if let Some(nat) = p.nature {
                stab.intern(&format!("{:?}", nat));
            }
            for m in &p.moves {
                stab.intern(m);
            }
        }
        for p in &self.p2_preview {
            stab.intern(&p.species);
            stab.intern_opt(p.known_item.as_deref());
            stab.intern_opt(p.known_ability.as_deref());
            for m in &p.known_moves {
                stab.intern(m);
            }
        }
        for (idx, ev) in self.lead_events.iter().enumerate() {
            intern_event(&mut stab, ev);
            if let Some(prov) = self.lead_provenance.get(idx) {
                stab.intern_opt(prov.comment.as_deref());
            }
        }
        for turn in &self.turns {
            intern_player_action(&mut stab, &turn.p1_action);
            if let Some(p2) = &turn.p2_action {
                intern_player_action(&mut stab, p2);
            }
            stab.intern_opt(turn.annotation.comment.as_deref());
            if let Some(best) = &turn.annotation.best_action {
                intern_player_action(&mut stab, best);
            }
            for (idx, ev) in turn.events.iter().enumerate() {
                intern_event(&mut stab, ev);
                if let Some(prov) = turn.event_provenance.get(idx) {
                    stab.intern_opt(prov.comment.as_deref());
                }
            }
        }

        let use_u16 = stab.strings.len() >= 255;
        let mut out = Vec::with_capacity(512);
        out.extend_from_slice(PKF_MAGIC);

        let result_bits = match self.result {
            MatchOutcome::Unknown => 0u8,
            MatchOutcome::P1Win => 1u8,
            MatchOutcome::P2Win => 2u8,
            MatchOutcome::Draw => 3u8,
        };
        let mut flags = (result_bits & 0x03) << 2;
        if self.is_open_team_sheet {
            flags |= FLAG_OTS;
        }
        if self.lead_timestamp_ms.is_some() {
            flags |= FLAG_LEAD_TIMESTAMP;
        }
        if use_u16 {
            flags |= FLAG_U16_STR_INDEX;
        }
        out.push(flags);

        let reg_byte = match self.regulation {
            Regulation::MA => 0u8,
            Regulation::MB => 1u8,
            Regulation::MC => 2u8,
        };
        out.push(reg_byte);

        // String table
        if use_u16 {
            write_u16(&mut out, stab.strings.len() as u16);
        } else {
            out.push(stab.strings.len() as u8);
        }
        for s in &stab.strings {
            let bytes = s.as_bytes();
            write_u16(&mut out, bytes.len() as u16);
            out.extend_from_slice(bytes);
        }

        let mut w = PkfWriter {
            out: &mut out,
            stab: &stab,
            use_u16,
        };

        // P1 team
        w.write_u8(self.p1_team.len() as u8);
        for p in &self.p1_team {
            w.write_str(&p.ident);
            w.write_str(&p.species);
            w.write_u16(p.hp as u16);
            w.write_u16(p.maxhp as u16);
            w.write_u16(p.attack as u16);
            w.write_u16(p.defense as u16);
            w.write_u16(p.sp_attack as u16);
            w.write_u16(p.sp_defense as u16);
            w.write_u16(p.speed as u16);
            w.write_opt_str(p.item.as_deref());
            w.write_opt_str(p.ability.as_deref());
            w.write_str(&p.type1);
            w.write_opt_str(p.type2.as_deref());
            let nat_str = p.nature.map(|n| format!("{:?}", n));
            w.write_opt_str(nat_str.as_deref());
            w.write_u8(p.moves.len() as u8);
            for m in &p.moves {
                w.write_str(m);
            }
            if let Some(evs) = &p.evs {
                w.write_u8(1);
                w.write_evs(evs);
            } else {
                w.write_u8(0);
            }
        }

        // P1 selection
        for &idx in &self.p1_selection {
            w.write_u8(idx as u8);
        }

        // P2 preview
        w.write_u8(self.p2_preview.len() as u8);
        for p in &self.p2_preview {
            w.write_u8(p.preview_index);
            w.write_str(&p.species);
            w.write_opt_str(p.known_item.as_deref());
            w.write_opt_str(p.known_ability.as_deref());
            w.write_u8(p.known_moves.len() as u8);
            for m in &p.known_moves {
                w.write_str(m);
            }
        }

        // Lead section
        if let Some(ts) = self.lead_timestamp_ms {
            w.write_u32(ts);
        }
        w.write_u16(self.lead_events.len() as u16);
        for (idx, ev) in self.lead_events.iter().enumerate() {
            let prov = self.lead_provenance.get(idx).filter(|p| !p.is_empty());
            w.write_event(ev, prov);
        }

        // Turns
        w.write_u16(self.turns.len() as u16);
        for turn in &self.turns {
            w.write_u16(turn.turn_number);
            let mut turn_flags = 0u8;
            if turn.p2_action.is_some() {
                turn_flags |= 0x01;
            }
            if !turn.annotation.is_empty() {
                turn_flags |= 0x02;
            }
            w.write_u8(turn_flags);
            w.write_player_action(&turn.p1_action);
            if let Some(p2) = &turn.p2_action {
                w.write_player_action(p2);
            }
            if !turn.annotation.is_empty() {
                w.write_annotation(&turn.annotation);
            }
            w.write_u16(turn.events.len() as u16);
            for (idx, ev) in turn.events.iter().enumerate() {
                let prov = turn.event_provenance.get(idx).filter(|p| !p.is_empty());
                w.write_event(ev, prov);
            }
        }

        out
    }

    /// `.pkf` バイナリ列から `BattleKifu` を復元する
    pub fn from_pkf_bytes(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 6 || &bytes[0..4] != PKF_MAGIC {
            return Err("Invalid PKF magic header".to_string());
        }
        let mut r = PkfReader {
            bytes,
            pos: 4,
            strings: Vec::new(),
            use_u16: false,
        };

        let flags = r.read_u8()?;
        let is_open_team_sheet = (flags & FLAG_OTS) != 0;
        let has_lead_ts = (flags & FLAG_LEAD_TIMESTAMP) != 0;
        r.use_u16 = (flags & FLAG_U16_STR_INDEX) != 0;
        let result = match (flags >> 2) & 0x03 {
            1 => MatchOutcome::P1Win,
            2 => MatchOutcome::P2Win,
            3 => MatchOutcome::Draw,
            _ => MatchOutcome::Unknown,
        };

        let reg_byte = r.read_u8()?;
        let regulation = match reg_byte {
            0 => Regulation::MA,
            1 => Regulation::MB,
            2 => Regulation::MC,
            other => return Err(format!("Unknown regulation byte: {}", other)),
        };

        let str_count = if r.use_u16 {
            r.read_u16()? as usize
        } else {
            r.read_u8()? as usize
        };
        let mut strings = Vec::with_capacity(str_count);
        for _ in 0..str_count {
            let len = r.read_u16()? as usize;
            let slice = r.read_slice(len)?;
            let s = std::str::from_utf8(slice)
                .map_err(|e| format!("Invalid UTF-8 in PKF string table: {}", e))?
                .to_string();
            strings.push(s);
        }
        r.strings = strings;

        // P1 team
        let p1_count = r.read_u8()? as usize;
        let mut p1_team = Vec::with_capacity(p1_count);
        for _ in 0..p1_count {
            let ident = r.read_str()?;
            let species = r.read_str()?;
            let hp = r.read_u16()? as i32;
            let maxhp = r.read_u16()? as i32;
            let attack = r.read_u16()? as i32;
            let defense = r.read_u16()? as i32;
            let sp_attack = r.read_u16()? as i32;
            let sp_defense = r.read_u16()? as i32;
            let speed = r.read_u16()? as i32;
            let item = r.read_opt_str()?;
            let ability = r.read_opt_str()?;
            let type1 = r.read_str()?;
            let type2 = r.read_opt_str()?;
            let nature_opt_str = r.read_opt_str()?;
            let nature = nature_opt_str.and_then(|s| super::pbn::parse_nature(&s));
            let move_count = r.read_u8()? as usize;
            let mut moves = Vec::with_capacity(move_count);
            for _ in 0..move_count {
                moves.push(r.read_str()?);
            }
            let has_evs = r.read_u8()? != 0;
            let evs = if has_evs { Some(r.read_evs()?) } else { None };
            p1_team.push(InputPokemonData {
                ident,
                species,
                hp,
                maxhp,
                attack,
                defense,
                sp_attack,
                sp_defense,
                speed,
                item,
                ability,
                status: None,
                type1,
                type2,
                added_type: None,
                boosts: Boosts::default(),
                volatile_status: Vec::new(),
                last_move_used: None,
                consecutive_move_counter: 0,
                pp_used: std::collections::HashMap::new(),
                taunt_turns: 0,
                moves,
                is_mega: false,
                evs,
                nature,
                substitute_hp: 0,
            });
        }

        let mut p1_selection = [0usize; 4];
        for slot in &mut p1_selection {
            *slot = r.read_u8()? as usize;
        }

        // P2 preview
        let p2_count = r.read_u8()? as usize;
        let mut p2_preview = Vec::with_capacity(p2_count);
        for _ in 0..p2_count {
            let preview_index = r.read_u8()?;
            let species = r.read_str()?;
            let known_item = r.read_opt_str()?;
            let known_ability = r.read_opt_str()?;
            let move_count = r.read_u8()? as usize;
            let mut known_moves = Vec::with_capacity(move_count);
            for _ in 0..move_count {
                known_moves.push(r.read_str()?);
            }
            p2_preview.push(OpponentPreviewSlot {
                preview_index,
                species,
                known_item,
                known_ability,
                known_moves,
            });
        }

        // Lead
        let lead_timestamp_ms = if has_lead_ts {
            Some(r.read_u32()?)
        } else {
            None
        };
        let lead_ev_count = r.read_u16()? as usize;
        let mut lead_events = Vec::with_capacity(lead_ev_count);
        let mut lead_provenance = Vec::new();
        let mut any_lead_prov = false;
        for _ in 0..lead_ev_count {
            let (ev, prov) = r.read_event()?;
            if !prov.is_empty() {
                any_lead_prov = true;
            }
            lead_events.push(ev);
            lead_provenance.push(prov);
        }
        if !any_lead_prov {
            lead_provenance.clear();
        }

        // Turns
        let turn_count = r.read_u16()? as usize;
        let mut turns = Vec::with_capacity(turn_count);
        for _ in 0..turn_count {
            let turn_number = r.read_u16()?;
            let turn_flags = r.read_u8()?;
            let p1_action = r.read_player_action()?;
            let p2_action = if (turn_flags & 0x01) != 0 {
                Some(r.read_player_action()?)
            } else {
                None
            };
            let annotation = if (turn_flags & 0x02) != 0 {
                r.read_annotation()?
            } else {
                TurnAnnotation::default()
            };
            let ev_count = r.read_u16()? as usize;
            let mut events = Vec::with_capacity(ev_count);
            let mut event_provenance = Vec::new();
            let mut any_prov = false;
            for _ in 0..ev_count {
                let (ev, prov) = r.read_event()?;
                if !prov.is_empty() {
                    any_prov = true;
                }
                events.push(ev);
                event_provenance.push(prov);
            }
            if !any_prov {
                event_provenance.clear();
            }
            turns.push(TurnRecord {
                turn_number,
                p1_action,
                p2_action,
                events,
                annotation,
                event_provenance,
                field_effects: Vec::new(),
            });
        }

        Ok(BattleKifu {
            regulation,
            is_open_team_sheet,
            result,
            p1_team,
            p1_selection,
            p2_preview,
            lead_events,
            lead_timestamp_ms,
            lead_provenance,
            turns,
        })
    }

    /// URL 共有用の Base64URL (パディングなし) 文字列へ変換する
    pub fn to_pkf_base64url(&self) -> String {
        base64url_encode(&self.to_pkf_bytes())
    }

    /// URL 共有用の Base64URL 文字列から `BattleKifu` を復元する
    pub fn from_pkf_base64url(encoded: &str) -> Result<Self, String> {
        let bytes = base64url_decode(encoded.trim())?;
        Self::from_pkf_bytes(&bytes)
    }
}

struct StringTableBuilder {
    strings: Vec<String>,
    map: HashMap<String, u16>,
}

impl StringTableBuilder {
    fn new() -> Self {
        Self {
            strings: Vec::new(),
            map: HashMap::new(),
        }
    }

    fn intern(&mut self, s: &str) -> u16 {
        if let Some(&idx) = self.map.get(s) {
            return idx;
        }
        let idx = self.strings.len() as u16;
        self.strings.push(s.to_string());
        self.map.insert(s.to_string(), idx);
        idx
    }

    fn intern_opt(&mut self, s: Option<&str>) {
        if let Some(val) = s {
            self.intern(val);
        }
    }

    fn get(&self, s: &str) -> u16 {
        *self.map.get(s).expect("string must be pre-interned")
    }
}

fn intern_slot_action(stab: &mut StringTableBuilder, action: &SlotActionJs) {
    stab.intern(&action.choice);
}

fn intern_player_action(stab: &mut StringTableBuilder, action: &PlayerActionJs) {
    intern_slot_action(stab, &action.slot_a);
    intern_slot_action(stab, &action.slot_b);
}

fn intern_event(stab: &mut StringTableBuilder, ev: &ObservedEvent) {
    match ev {
        ObservedEvent::SwitchIn { species, .. } => {
            stab.intern(species);
        }
        ObservedEvent::MegaEvolve {
            mega_species, item, ..
        } => {
            stab.intern(mega_species);
            stab.intern(item);
        }
        ObservedEvent::MoveUsed { move_id, .. } => {
            stab.intern(move_id);
        }
        ObservedEvent::Damage {
            from_effect,
            move_id,
            ..
        } => {
            stab.intern_opt(from_effect.as_deref());
            stab.intern_opt(move_id.as_deref());
        }
        ObservedEvent::Heal { from_effect, .. } => {
            stab.intern_opt(from_effect.as_deref());
        }
        ObservedEvent::AbilityTriggered { ability, .. } => {
            stab.intern(ability);
        }
        ObservedEvent::ItemTriggered { item, .. } => {
            stab.intern(item);
        }
        ObservedEvent::StatStageChanged { stat, .. } => {
            stab.intern(stat);
        }
        ObservedEvent::StatusChanged { status, .. } => {
            stab.intern_opt(status.as_deref());
        }
        ObservedEvent::WeatherChanged { weather } => {
            stab.intern_opt(weather.as_deref());
        }
        ObservedEvent::TerrainChanged { terrain } => {
            stab.intern_opt(terrain.as_deref());
        }
        ObservedEvent::FieldConditionChanged { condition, .. } => {
            stab.intern(condition);
        }
        ObservedEvent::SideConditionChanged { condition, .. } => {
            stab.intern(condition);
        }
        ObservedEvent::Faint { .. } => {}
    }
}

fn write_u16(out: &mut Vec<u8>, v: u16) {
    out.extend_from_slice(&v.to_le_bytes());
}

struct PkfWriter<'a> {
    out: &'a mut Vec<u8>,
    stab: &'a StringTableBuilder,
    use_u16: bool,
}

impl<'a> PkfWriter<'a> {
    fn write_u8(&mut self, v: u8) {
        self.out.push(v);
    }

    fn write_u16(&mut self, v: u16) {
        self.out.extend_from_slice(&v.to_le_bytes());
    }

    fn write_u32(&mut self, v: u32) {
        self.out.extend_from_slice(&v.to_le_bytes());
    }

    fn write_str(&mut self, s: &str) {
        let idx = self.stab.get(s);
        if self.use_u16 {
            self.write_u16(idx);
        } else {
            self.write_u8(idx as u8);
        }
    }

    fn write_opt_str(&mut self, s: Option<&str>) {
        match s {
            Some(val) => self.write_str(val),
            None => {
                if self.use_u16 {
                    self.write_u16(0xFFFF);
                } else {
                    self.write_u8(0xFF);
                }
            }
        }
    }

    fn write_evs(&mut self, evs: &PokemonEvs) {
        self.write_u8(evs.hp.unwrap_or(0));
        self.write_u8(evs.atk.unwrap_or(0));
        self.write_u8(evs.def.unwrap_or(0));
        self.write_u8(evs.spa.unwrap_or(0));
        self.write_u8(evs.spd.unwrap_or(0));
        self.write_u8(evs.spe.unwrap_or(0));
    }

    fn write_ident(&mut self, ident: PokemonIdent) {
        let b = ((ident.player & 0x03) << 2) | ((ident.slot as u8) & 0x03);
        self.write_u8(b);
    }

    fn write_opt_ident(&mut self, ident: Option<PokemonIdent>) {
        match ident {
            Some(id) => self.write_ident(id),
            None => self.write_u8(0xFF),
        }
    }

    fn write_hp(&mut self, hp: ObservedHp) {
        match hp {
            ObservedHp::Exact { current, max } => {
                self.write_u8(0);
                self.write_u16(current);
                self.write_u16(max);
            }
            ObservedHp::Percent { percent } => {
                self.write_u8(1);
                self.write_u8(percent);
            }
            ObservedHp::Unknown => {
                self.write_u8(2);
            }
        }
    }

    fn write_slot_action(&mut self, action: &SlotActionJs) {
        self.write_str(&action.choice);
        self.write_u8(action.target as u8);
        self.write_u8(if action.mega { 1 } else { 0 });
    }

    fn write_player_action(&mut self, action: &PlayerActionJs) {
        self.write_slot_action(&action.slot_a);
        self.write_slot_action(&action.slot_b);
    }

    fn write_annotation(&mut self, ann: &TurnAnnotation) {
        let mut flags = 0u8;
        if ann.comment.is_some() {
            flags |= 0x01;
        }
        if ann.timestamp_ms.is_some() {
            flags |= 0x02;
        }
        if ann.eval_win_rate.is_some() {
            flags |= 0x04;
        }
        if ann.best_action.is_some() {
            flags |= 0x08;
        }
        if ann.action_quality.is_some() {
            flags |= 0x10;
        }
        self.write_u8(flags);
        if let Some(c) = &ann.comment {
            self.write_str(c);
        }
        if let Some(ts) = ann.timestamp_ms {
            self.write_u32(ts);
        }
        if let Some(eval) = ann.eval_win_rate {
            let bp = (eval.clamp(0.0, 1.0) * 10000.0).round() as u16;
            self.write_u16(bp);
        }
        if let Some(best) = &ann.best_action {
            self.write_player_action(best);
        }
        if let Some(q) = ann.action_quality {
            let qb = match q {
                ActionQuality::Best => 0,
                ActionQuality::Good => 1,
                ActionQuality::Inaccuracy => 2,
                ActionQuality::Blunder => 3,
            };
            self.write_u8(qb);
        }
    }

    fn write_provenance(&mut self, prov: &EventProvenance) {
        let mut flags = 0u8;
        if prov.timestamp_ms.is_some() {
            flags |= 0x01;
        }
        if prov.confidence.is_some() {
            flags |= 0x02;
        }
        if prov.needs_review {
            flags |= 0x04;
        }
        if prov.comment.is_some() {
            flags |= 0x08;
        }
        self.write_u8(flags);
        if let Some(ts) = prov.timestamp_ms {
            self.write_u32(ts);
        }
        if let Some(conf) = prov.confidence {
            self.write_u8(conf);
        }
        if let Some(c) = &prov.comment {
            self.write_str(c);
        }
    }

    fn write_event(&mut self, ev: &ObservedEvent, prov: Option<&EventProvenance>) {
        let prov_bit = if prov.is_some() { OP_PROVENANCE_BIT } else { 0 };
        match ev {
            ObservedEvent::SwitchIn {
                player,
                slot,
                team_index,
                species,
                hp,
            } => {
                self.write_u8(OP_SWITCH_IN | prov_bit);
                self.write_ident(PokemonIdent {
                    player: *player,
                    slot: *slot,
                });
                self.write_u8(*team_index);
                self.write_str(species);
                self.write_hp(*hp);
            }
            ObservedEvent::MegaEvolve {
                target,
                mega_species,
                item,
            } => {
                self.write_u8(OP_MEGA_EVOLVE | prov_bit);
                self.write_ident(*target);
                self.write_str(mega_species);
                self.write_str(item);
            }
            ObservedEvent::MoveUsed {
                attacker,
                move_id,
                target,
            } => {
                self.write_u8(OP_MOVE_USED | prov_bit);
                self.write_ident(*attacker);
                self.write_str(move_id);
                self.write_opt_ident(*target);
            }
            ObservedEvent::Damage {
                target,
                hp_after,
                damage_exact,
                is_crit,
                effectiveness,
                from_effect,
                attacker,
                move_id,
                is_spread,
            } => {
                self.write_u8(OP_DAMAGE | prov_bit);
                self.write_ident(*target);
                self.write_hp(*hp_after);
                let mut dflags = 0u8;
                if damage_exact.is_some() {
                    dflags |= 0x01;
                }
                if *is_crit {
                    dflags |= 0x02;
                }
                if effectiveness.is_some() {
                    dflags |= 0x04;
                }
                if from_effect.is_some() {
                    dflags |= 0x08;
                }
                if attacker.is_some() {
                    dflags |= 0x10;
                }
                if move_id.is_some() {
                    dflags |= 0x20;
                }
                if *is_spread {
                    dflags |= 0x40;
                }
                self.write_u8(dflags);
                if let Some(dmg) = damage_exact {
                    self.write_u16(*dmg);
                }
                if let Some(eff) = effectiveness {
                    self.write_u8(*eff as u8);
                }
                if let Some(fe) = from_effect {
                    self.write_str(fe);
                }
                if let Some(atk) = attacker {
                    self.write_ident(*atk);
                }
                if let Some(mv) = move_id {
                    self.write_str(mv);
                }
            }
            ObservedEvent::Heal {
                target,
                hp_after,
                from_effect,
            } => {
                self.write_u8(OP_HEAL | prov_bit);
                self.write_ident(*target);
                self.write_hp(*hp_after);
                self.write_opt_str(from_effect.as_deref());
            }
            ObservedEvent::AbilityTriggered { source, ability } => {
                self.write_u8(OP_ABILITY_TRIGGERED | prov_bit);
                self.write_ident(*source);
                self.write_str(ability);
            }
            ObservedEvent::ItemTriggered {
                source,
                item,
                consumed,
            } => {
                self.write_u8(OP_ITEM_TRIGGERED | prov_bit);
                self.write_ident(*source);
                self.write_str(item);
                self.write_u8(if *consumed { 1 } else { 0 });
            }
            ObservedEvent::StatStageChanged {
                target,
                stat,
                delta,
            } => {
                self.write_u8(OP_STAT_STAGE_CHANGED | prov_bit);
                self.write_ident(*target);
                self.write_str(stat);
                self.write_u8(*delta as u8);
            }
            ObservedEvent::StatusChanged { target, status } => {
                self.write_u8(OP_STATUS_CHANGED | prov_bit);
                self.write_ident(*target);
                self.write_opt_str(status.as_deref());
            }
            ObservedEvent::WeatherChanged { weather } => {
                self.write_u8(OP_WEATHER_CHANGED | prov_bit);
                self.write_opt_str(weather.as_deref());
            }
            ObservedEvent::TerrainChanged { terrain } => {
                self.write_u8(OP_TERRAIN_CHANGED | prov_bit);
                self.write_opt_str(terrain.as_deref());
            }
            ObservedEvent::FieldConditionChanged { condition, active } => {
                self.write_u8(OP_FIELD_COND_CHANGED | prov_bit);
                self.write_str(condition);
                self.write_u8(if *active { 1 } else { 0 });
            }
            ObservedEvent::SideConditionChanged {
                player,
                condition,
                active,
            } => {
                self.write_u8(OP_SIDE_COND_CHANGED | prov_bit);
                self.write_u8(*player);
                self.write_str(condition);
                self.write_u8(if *active { 1 } else { 0 });
            }
            ObservedEvent::Faint { target } => {
                self.write_u8(OP_FAINT | prov_bit);
                self.write_ident(*target);
            }
        }
        if let Some(p) = prov {
            self.write_provenance(p);
        }
    }
}

struct PkfReader<'a> {
    bytes: &'a [u8],
    pos: usize,
    strings: Vec<String>,
    use_u16: bool,
}

impl<'a> PkfReader<'a> {
    fn read_slice(&mut self, len: usize) -> Result<&'a [u8], String> {
        if self.pos + len > self.bytes.len() {
            return Err("Unexpected EOF while reading PKF binary".to_string());
        }
        let s = &self.bytes[self.pos..self.pos + len];
        self.pos += len;
        Ok(s)
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        Ok(self.read_slice(1)?[0])
    }

    fn read_u16(&mut self) -> Result<u16, String> {
        let b = self.read_slice(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn read_u32(&mut self) -> Result<u32, String> {
        let b = self.read_slice(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn read_str(&mut self) -> Result<String, String> {
        let idx = if self.use_u16 {
            self.read_u16()? as usize
        } else {
            self.read_u8()? as usize
        };
        self.strings
            .get(idx)
            .cloned()
            .ok_or_else(|| format!("Invalid PKF string table index: {}", idx))
    }

    fn read_opt_str(&mut self) -> Result<Option<String>, String> {
        let idx = if self.use_u16 {
            let v = self.read_u16()?;
            if v == 0xFFFF {
                return Ok(None);
            }
            v as usize
        } else {
            let v = self.read_u8()?;
            if v == 0xFF {
                return Ok(None);
            }
            v as usize
        };
        self.strings
            .get(idx)
            .cloned()
            .map(Some)
            .ok_or_else(|| format!("Invalid PKF optional string index: {}", idx))
    }

    fn read_evs(&mut self) -> Result<PokemonEvs, String> {
        Ok(PokemonEvs {
            hp: Some(self.read_u8()?),
            atk: Some(self.read_u8()?),
            def: Some(self.read_u8()?),
            spa: Some(self.read_u8()?),
            spd: Some(self.read_u8()?),
            spe: Some(self.read_u8()?),
        })
    }

    fn read_ident(&mut self) -> Result<PokemonIdent, String> {
        let b = self.read_u8()?;
        let player = (b >> 2) & 0x03;
        let slot = (b & 0x03) as usize;
        Ok(PokemonIdent { player, slot })
    }

    fn read_opt_ident(&mut self) -> Result<Option<PokemonIdent>, String> {
        let b = self.read_u8()?;
        if b == 0xFF {
            return Ok(None);
        }
        let player = (b >> 2) & 0x03;
        let slot = (b & 0x03) as usize;
        Ok(Some(PokemonIdent { player, slot }))
    }

    fn read_hp(&mut self) -> Result<ObservedHp, String> {
        let kind = self.read_u8()?;
        match kind {
            0 => {
                let current = self.read_u16()?;
                let max = self.read_u16()?;
                Ok(ObservedHp::Exact { current, max })
            }
            1 => {
                let percent = self.read_u8()?;
                Ok(ObservedHp::Percent { percent })
            }
            2 => Ok(ObservedHp::Unknown),
            other => Err(format!("Invalid ObservedHp kind byte: {}", other)),
        }
    }

    fn read_slot_action(&mut self) -> Result<SlotActionJs, String> {
        let choice = self.read_str()?;
        let target = self.read_u8()? as i8;
        let mega = self.read_u8()? != 0;
        Ok(SlotActionJs {
            choice,
            target,
            mega,
        })
    }

    fn read_player_action(&mut self) -> Result<PlayerActionJs, String> {
        Ok(PlayerActionJs {
            slot_a: self.read_slot_action()?,
            slot_b: self.read_slot_action()?,
        })
    }

    fn read_annotation(&mut self) -> Result<TurnAnnotation, String> {
        let flags = self.read_u8()?;
        let comment = if (flags & 0x01) != 0 {
            Some(self.read_str()?)
        } else {
            None
        };
        let timestamp_ms = if (flags & 0x02) != 0 {
            Some(self.read_u32()?)
        } else {
            None
        };
        let eval_win_rate = if (flags & 0x04) != 0 {
            let bp = self.read_u16()?;
            Some((bp as f64) / 10000.0)
        } else {
            None
        };
        let best_action = if (flags & 0x08) != 0 {
            Some(self.read_player_action()?)
        } else {
            None
        };
        let action_quality = if (flags & 0x10) != 0 {
            let qb = self.read_u8()?;
            Some(match qb {
                0 => ActionQuality::Best,
                1 => ActionQuality::Good,
                2 => ActionQuality::Inaccuracy,
                _ => ActionQuality::Blunder,
            })
        } else {
            None
        };
        Ok(TurnAnnotation {
            comment,
            timestamp_ms,
            eval_win_rate,
            best_action,
            action_quality,
        })
    }

    fn read_provenance(&mut self) -> Result<EventProvenance, String> {
        let flags = self.read_u8()?;
        let timestamp_ms = if (flags & 0x01) != 0 {
            Some(self.read_u32()?)
        } else {
            None
        };
        let confidence = if (flags & 0x02) != 0 {
            Some(self.read_u8()?)
        } else {
            None
        };
        let needs_review = (flags & 0x04) != 0;
        let comment = if (flags & 0x08) != 0 {
            Some(self.read_str()?)
        } else {
            None
        };
        Ok(EventProvenance {
            timestamp_ms,
            confidence,
            needs_review,
            comment,
        })
    }

    fn read_event(&mut self) -> Result<(ObservedEvent, EventProvenance), String> {
        let raw_op = self.read_u8()?;
        let has_prov = (raw_op & OP_PROVENANCE_BIT) != 0;
        let op = raw_op & !OP_PROVENANCE_BIT;

        let ev = match op {
            OP_SWITCH_IN => {
                let id = self.read_ident()?;
                let team_index = self.read_u8()?;
                let species = self.read_str()?;
                let hp = self.read_hp()?;
                ObservedEvent::SwitchIn {
                    player: id.player,
                    slot: id.slot,
                    team_index,
                    species,
                    hp,
                }
            }
            OP_MEGA_EVOLVE => {
                let target = self.read_ident()?;
                let mega_species = self.read_str()?;
                let item = self.read_str()?;
                ObservedEvent::MegaEvolve {
                    target,
                    mega_species,
                    item,
                }
            }
            OP_MOVE_USED => {
                let attacker = self.read_ident()?;
                let move_id = self.read_str()?;
                let target = self.read_opt_ident()?;
                ObservedEvent::MoveUsed {
                    attacker,
                    move_id,
                    target,
                }
            }
            OP_DAMAGE => {
                let target = self.read_ident()?;
                let hp_after = self.read_hp()?;
                let dflags = self.read_u8()?;
                let damage_exact = if (dflags & 0x01) != 0 {
                    Some(self.read_u16()?)
                } else {
                    None
                };
                let is_crit = (dflags & 0x02) != 0;
                let effectiveness = if (dflags & 0x04) != 0 {
                    Some(self.read_u8()? as i8)
                } else {
                    None
                };
                let from_effect = if (dflags & 0x08) != 0 {
                    Some(self.read_str()?)
                } else {
                    None
                };
                let attacker = if (dflags & 0x10) != 0 {
                    Some(self.read_ident()?)
                } else {
                    None
                };
                let move_id = if (dflags & 0x20) != 0 {
                    Some(self.read_str()?)
                } else {
                    None
                };
                let is_spread = (dflags & 0x40) != 0;
                ObservedEvent::Damage {
                    target,
                    hp_after,
                    damage_exact,
                    is_crit,
                    effectiveness,
                    from_effect,
                    attacker,
                    move_id,
                    is_spread,
                }
            }
            OP_HEAL => {
                let target = self.read_ident()?;
                let hp_after = self.read_hp()?;
                let from_effect = self.read_opt_str()?;
                ObservedEvent::Heal {
                    target,
                    hp_after,
                    from_effect,
                }
            }
            OP_ABILITY_TRIGGERED => {
                let source = self.read_ident()?;
                let ability = self.read_str()?;
                ObservedEvent::AbilityTriggered { source, ability }
            }
            OP_ITEM_TRIGGERED => {
                let source = self.read_ident()?;
                let item = self.read_str()?;
                let consumed = self.read_u8()? != 0;
                ObservedEvent::ItemTriggered {
                    source,
                    item,
                    consumed,
                }
            }
            OP_STAT_STAGE_CHANGED => {
                let target = self.read_ident()?;
                let stat = self.read_str()?;
                let delta = self.read_u8()? as i8;
                ObservedEvent::StatStageChanged {
                    target,
                    stat,
                    delta,
                }
            }
            OP_STATUS_CHANGED => {
                let target = self.read_ident()?;
                let status = self.read_opt_str()?;
                ObservedEvent::StatusChanged { target, status }
            }
            OP_WEATHER_CHANGED => {
                let weather = self.read_opt_str()?;
                ObservedEvent::WeatherChanged { weather }
            }
            OP_TERRAIN_CHANGED => {
                let terrain = self.read_opt_str()?;
                ObservedEvent::TerrainChanged { terrain }
            }
            OP_FIELD_COND_CHANGED => {
                let condition = self.read_str()?;
                let active = self.read_u8()? != 0;
                ObservedEvent::FieldConditionChanged { condition, active }
            }
            OP_SIDE_COND_CHANGED => {
                let player = self.read_u8()?;
                let condition = self.read_str()?;
                let active = self.read_u8()? != 0;
                ObservedEvent::SideConditionChanged {
                    player,
                    condition,
                    active,
                }
            }
            OP_FAINT => {
                let target = self.read_ident()?;
                ObservedEvent::Faint { target }
            }
            other => return Err(format!("Unknown PKF event opcode: 0x{:02X}", other)),
        };

        let prov = if has_prov {
            self.read_provenance()?
        } else {
            EventProvenance::default()
        };

        Ok((ev, prov))
    }
}

const BASE64URL_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn base64url_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() * 4).div_ceil(3));
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(BASE64URL_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[(n & 0x3F) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(BASE64URL_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(BASE64URL_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
    }
    out
}

fn base64url_val(b: u8) -> Result<u32, String> {
    match b {
        b'A'..=b'Z' => Ok((b - b'A') as u32),
        b'a'..=b'z' => Ok((b - b'a' + 26) as u32),
        b'0'..=b'9' => Ok((b - b'0' + 52) as u32),
        b'-' | b'+' => Ok(62),
        b'_' | b'/' => Ok(63),
        _ => Err(format!("Invalid Base64URL character: {:?}", b as char)),
    }
}

fn base64url_decode(encoded: &str) -> Result<Vec<u8>, String> {
    let bytes: Vec<u8> = encoded.bytes().filter(|&b| b != b'=').collect();
    if bytes.len() % 4 == 1 {
        return Err("Invalid Base64URL length".to_string());
    }
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let n = (base64url_val(bytes[i])? << 18)
            | (base64url_val(bytes[i + 1])? << 12)
            | (base64url_val(bytes[i + 2])? << 6)
            | base64url_val(bytes[i + 3])?;
        out.push(((n >> 16) & 0xFF) as u8);
        out.push(((n >> 8) & 0xFF) as u8);
        out.push((n & 0xFF) as u8);
        i += 4;
    }
    let rem = bytes.len() - i;
    if rem == 2 {
        let n = (base64url_val(bytes[i])? << 18) | (base64url_val(bytes[i + 1])? << 12);
        out.push(((n >> 16) & 0xFF) as u8);
    } else if rem == 3 {
        let n = (base64url_val(bytes[i])? << 18)
            | (base64url_val(bytes[i + 1])? << 12)
            | (base64url_val(bytes[i + 2])? << 6);
        out.push(((n >> 16) & 0xFF) as u8);
        out.push(((n >> 8) & 0xFF) as u8);
    }
    Ok(out)
}
