//! PBN (Pokémon Battle Notation, `.pbn`) のシリアライザ (`to_pbn`) およびパーサ (`from_pbn`)

use crate::types::{
    Boosts, InputPokemonData, Nature, PlayerActionJs, PokemonEvs, PokemonIdent, SlotActionJs,
};
use crate::{
    ActionQuality, BattleKifu, EventProvenance, MatchOutcome, ObservedEvent, ObservedHp,
    OpponentPreviewSlot, TurnAnnotation, TurnRecord,
};
use pkmn_meta::Regulation;
use std::fmt::Write;

impl BattleKifu {
    /// `BattleKifu` を人間可読な PBN (Pokémon Battle Notation) テキストへ変換する
    pub fn to_pbn(&self) -> String {
        let mut out = String::with_capacity(2048);

        // 1. Headers
        let _ = writeln!(out, "[PBN \"1.0\"]");
        let reg_str = match self.regulation {
            Regulation::MA => "M-A",
            Regulation::MB => "M-B",
            Regulation::MC => "M-C",
        };
        let _ = writeln!(out, "[Regulation \"{reg_str}\"]");
        let sheet_str = if self.is_open_team_sheet {
            "OTS"
        } else {
            "CTS"
        };
        let _ = writeln!(out, "[Sheet \"{sheet_str}\"]");
        let res_str = match self.result {
            MatchOutcome::P1Win => "WIN",
            MatchOutcome::P2Win => "LOSS",
            MatchOutcome::Draw => "DRAW",
            MatchOutcome::Unknown => "UNKNOWN",
        };
        let _ = writeln!(out, "[Result \"{res_str}\"]");
        let _ = writeln!(out);

        // 2. P1 Team & Selection
        for (idx, p) in self.p1_team.iter().enumerate() {
            let item_str = p.item.as_deref().unwrap_or("-");
            let ab_str = p.ability.as_deref().unwrap_or("-");
            let spread_str = format_champions_spread(p.nature, p.evs.as_ref());
            let hp_str = if p.hp != p.maxhp && p.hp > 0 {
                format!("{}/{}", p.hp, p.maxhp)
            } else {
                format!("{}", p.maxhp)
            };
            let stats_str = format!(
                "{},{},{},{},{},{}",
                hp_str, p.attack, p.defense, p.sp_attack, p.sp_defense, p.speed
            );
            let moves_str = p.moves.join(", ");
            let _ = writeln!(
                out,
                "@p1 {} {} @ {} | {} | {} | {} | {}",
                idx, p.species, item_str, ab_str, spread_str, stats_str, moves_str
            );
        }
        let _ = writeln!(
            out,
            "@select {}, {}, {}, {}",
            self.p1_selection[0], self.p1_selection[1], self.p1_selection[2], self.p1_selection[3]
        );
        let _ = writeln!(out);

        // 3. P2 Preview
        for slot in &self.p2_preview {
            let has_ots_info = slot.known_item.is_some()
                || slot.known_ability.is_some()
                || !slot.known_moves.is_empty();
            if has_ots_info {
                let item_str = slot.known_item.as_deref().unwrap_or("-");
                let ab_str = slot.known_ability.as_deref().unwrap_or("-");
                let moves_str = slot.known_moves.join(", ");
                let _ = writeln!(
                    out,
                    "@p2 {} {} @ {} | {} | {}",
                    slot.preview_index, slot.species, item_str, ab_str, moves_str
                );
            } else {
                let _ = writeln!(out, "@p2 {} {}", slot.preview_index, slot.species);
            }
        }
        let _ = writeln!(out);

        // 4. Lead Events
        let _ = write!(out, "@lead");
        if let Some(ts) = self.lead_timestamp_ms {
            let _ = write!(out, " @t={ts}ms");
        }
        let _ = writeln!(out);
        for (i, ev) in self.lead_events.iter().enumerate() {
            let prov = self.lead_provenance.get(i);
            let _ = writeln!(out, "{}", format_event_line(ev, prov));
        }
        let _ = writeln!(out);

        // 5. Turns
        for turn in &self.turns {
            let _ = write!(out, "@turn {}", turn.turn_number);
            if let Some(ts) = turn.annotation.timestamp_ms {
                let _ = write!(out, " @t={ts}ms");
            }
            if let Some(eval) = turn.annotation.eval_win_rate {
                let _ = write!(out, " @eval={:.1}%", eval * 100.0);
            }
            if let Some(ref best) = turn.annotation.best_action {
                let _ = write!(out, " @best=\"{}\"", format_player_action_compact(best, 1));
            }
            if let Some(q) = turn.annotation.action_quality {
                let q_str = match q {
                    ActionQuality::Best => "Best",
                    ActionQuality::Good => "Good",
                    ActionQuality::Inaccuracy => "Inaccuracy",
                    ActionQuality::Blunder => "Blunder",
                };
                let _ = write!(out, " @quality={q_str}");
            }
            let _ = writeln!(out);

            if let Some(ref comment) = turn.annotation.comment {
                let _ = writeln!(out, "{{ {} }}", comment.trim());
            }

            if !turn.field_effects.is_empty() {
                let _ = writeln!(out, "  @field {}", turn.field_effects.join(" | "));
            }
            if !turn.state_effects.is_empty() {
                let _ = writeln!(out, "  @state");
                let mut current_side = "";
                for s in &turn.state_effects {
                    let s_trimmed = s.trim();
                    if s_trimmed == "p1:" || s_trimmed == "p2:" {
                        current_side = s_trimmed;
                        let _ = writeln!(out, "  {}", s_trimmed);
                    } else if let Some(rest) = s_trimmed.strip_prefix("p1:") {
                        if current_side != "p1:" {
                            current_side = "p1:";
                            let _ = writeln!(out, "  p1:");
                        }
                        let item = rest.trim().trim_start_matches('|').trim();
                        let _ = writeln!(out, "    | {}", item);
                    } else if let Some(rest) = s_trimmed.strip_prefix("p2:") {
                        if current_side != "p2:" {
                            current_side = "p2:";
                            let _ = writeln!(out, "  p2:");
                        }
                        let item = rest.trim().trim_start_matches('|').trim();
                        let _ = writeln!(out, "    | {}", item);
                    } else if let Some(rest) = s_trimmed.strip_prefix("p1 bench:") {
                        if current_side != "p1:" {
                            current_side = "p1:";
                            let _ = writeln!(out, "  p1:");
                        }
                        let _ = writeln!(out, "    | bench: {}", rest.trim());
                    } else if let Some(rest) = s_trimmed.strip_prefix("p2 bench:") {
                        if current_side != "p2:" {
                            current_side = "p2:";
                            let _ = writeln!(out, "  p2:");
                        }
                        let _ = writeln!(out, "    | bench: {}", rest.trim());
                    } else if s_trimmed.starts_with("p1a:")
                        || s_trimmed.starts_with("p1b:")
                        || s_trimmed.starts_with("p2a:")
                        || s_trimmed.starts_with("p2b:")
                    {
                        let _ = writeln!(out, "        {}", s_trimmed);
                    } else {
                        let item = s_trimmed.trim_start_matches('|').trim();
                        let _ = writeln!(out, "    | {}", item);
                    }
                }
            }

            let _ = writeln!(
                out,
                "@cmd {}",
                format_player_action_cmd(&turn.p1_action, "p1a", "p1b")
            );
            if let Some(ref p2_act) = turn.p2_action {
                let _ = writeln!(
                    out,
                    "@p2cmd {}",
                    format_player_action_cmd(p2_act, "p2a", "p2b")
                );
            }

            for (i, ev) in turn.events.iter().enumerate() {
                let prov = turn.event_provenance.get(i);
                let _ = writeln!(out, "{}", format_event_line(ev, prov));
            }
            let _ = writeln!(out);
        }

        out
    }

    /// PBN (Pokémon Battle Notation) テキストをパースして `BattleKifu` を構築する
    pub fn from_pbn(input: &str) -> Result<Self, String> {
        let mut regulation = Regulation::MA;
        let mut is_open_team_sheet = false;
        let mut result = MatchOutcome::Unknown;
        let mut p1_team: Vec<InputPokemonData> = Vec::new();
        let mut p1_selection: [usize; 4] = [0, 1, 2, 3];
        let mut p2_preview: Vec<OpponentPreviewSlot> = Vec::new();
        let mut lead_events: Vec<ObservedEvent> = Vec::new();
        let mut lead_timestamp_ms: Option<u32> = None;
        let mut lead_provenance: Vec<EventProvenance> = Vec::new();
        let mut turns: Vec<TurnRecord> = Vec::new();

        #[derive(PartialEq, Eq)]
        enum Section {
            Top,
            Lead,
            Turn,
        }
        let mut section = Section::Top;
        #[derive(PartialEq, Eq)]
        enum DirectiveSubmode {
            None,
            Field,
            State,
        }
        let mut submode = DirectiveSubmode::None;

        for (line_idx, raw_line) in input.lines().enumerate() {
            let line_num = line_idx + 1;
            let trimmed = raw_line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // 1. Header tags: [Key "Value"]
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                let inner = &trimmed[1..trimmed.len() - 1];
                if let Some((key, val_part)) = inner.split_once(' ') {
                    let val = val_part.trim().trim_matches('"');
                    match key.to_lowercase().as_str() {
                        "regulation" => {
                            regulation = match val.to_uppercase().as_str() {
                                "M-B" | "MB" => Regulation::MB,
                                "M-C" | "MC" | "CHAMPIONS" => Regulation::MC,
                                _ => Regulation::MA,
                            };
                        }
                        "sheet" => {
                            is_open_team_sheet = val.eq_ignore_ascii_case("OTS");
                        }
                        "result" => {
                            result = match val.to_uppercase().as_str() {
                                "WIN" | "P1WIN" => MatchOutcome::P1Win,
                                "LOSS" | "LOSE" | "P2WIN" => MatchOutcome::P2Win,
                                "DRAW" | "TIE" => MatchOutcome::Draw,
                                _ => MatchOutcome::Unknown,
                            };
                        }
                        _ => {}
                    }
                }
                continue;
            }

            // 2. Standalone closing brace or comment line `{ ... }` inside a turn
            if trimmed == "}" {
                continue;
            }
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                let inner = trimmed[1..trimmed.len() - 1].trim();
                if inner == "protected"
                    || inner == "missed"
                    || inner == "failed"
                    || inner == "immune"
                {
                    let last_evs = match section {
                        Section::Lead | Section::Top => &lead_events,
                        Section::Turn => turns.last().map(|t| &t.events).unwrap_or(&lead_events),
                    };
                    let last_target = last_evs.iter().rev().find_map(|ev| {
                        if let ObservedEvent::MoveUsed { target, .. } = ev {
                            *target
                        } else {
                            None
                        }
                    });
                    let ev = ObservedEvent::MoveOutcome {
                        target: last_target,
                        outcome: inner.to_string(),
                    };
                    match section {
                        Section::Lead | Section::Top => {
                            lead_events.push(ev);
                            lead_provenance.push(EventProvenance::default());
                        }
                        Section::Turn => {
                            if let Some(cur_turn) = turns.last_mut() {
                                cur_turn.events.push(ev);
                                cur_turn.event_provenance.push(EventProvenance::default());
                            }
                        }
                    }
                } else if section == Section::Turn
                    && let Some(cur_turn) = turns.last_mut()
                {
                    cur_turn.annotation.comment = Some(inner.to_string());
                }
                continue;
            }

            // 3. Directives starting with `@`
            if let Some(rest) = trimmed.strip_prefix("@p1 ") {
                let poke = parse_p1_line(rest, p1_team.len())
                    .map_err(|e| format!("Line {line_num}: {e}"))?;
                p1_team.push(poke);
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@select ") {
                let nums: Vec<usize> = rest
                    .split(',')
                    .filter_map(|s| s.trim().parse::<usize>().ok())
                    .collect();
                if nums.len() >= 4 {
                    p1_selection = [nums[0], nums[1], nums[2], nums[3]];
                }
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@p2 ") {
                let slot = parse_p2_line(rest, p2_preview.len() as u8)
                    .map_err(|e| format!("Line {line_num}: {e}"))?;
                p2_preview.push(slot);
                continue;
            }
            if trimmed == "@lead" || trimmed.starts_with("@lead ") {
                section = Section::Lead;
                submode = DirectiveSubmode::None;
                let rest = trimmed.strip_prefix("@lead").unwrap_or("").trim();
                for tok in rest.split_whitespace() {
                    if let Some(ms_str) = tok.strip_prefix("@t=") {
                        lead_timestamp_ms = ms_str.trim_end_matches("ms").parse::<u32>().ok();
                    }
                }
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@turn ") {
                section = Section::Turn;
                submode = DirectiveSubmode::None;
                let turn_rec =
                    parse_turn_header(rest).map_err(|e| format!("Line {line_num}: {e}"))?;
                turns.push(turn_rec);
                continue;
            }
            let is_field_line = trimmed == "@field"
                || trimmed.starts_with("@field ")
                || (section == Section::Turn
                    && ((submode == DirectiveSubmode::Field && trimmed.starts_with('|'))
                        || (submode == DirectiveSubmode::Field
                            && (trimmed.starts_with("entire:")
                                || trimmed.starts_with("p1:")
                                || trimmed.starts_with("p2:")))
                        || (submode != DirectiveSubmode::State
                            && ((trimmed.starts_with('|')
                                && (trimmed.contains("entire:")
                                    || (!trimmed.contains("bench:")
                                        && !trimmed.contains("p1a:")
                                        && !trimmed.contains("p1b:")
                                        && (trimmed.contains("p1:")
                                            || trimmed.contains("p2:")))))
                                || trimmed.starts_with("entire:")))));

            if is_field_line {
                submode = DirectiveSubmode::Field;
                let content = if let Some(rest) = trimmed.strip_prefix("@field") {
                    rest.trim()
                } else {
                    trimmed
                };
                let content = content.trim_start_matches('|').trim();
                if !content.is_empty() {
                    for part in content.split('|') {
                        let item = part.trim();
                        if !item.is_empty()
                            && let Some(cur_turn) = turns.last_mut()
                        {
                            cur_turn.field_effects.push(item.to_string());
                        }
                    }
                }
                continue;
            }

            let is_state_line = trimmed == "@state"
                || trimmed.starts_with("@state ")
                || (section == Section::Turn
                    && ((submode == DirectiveSubmode::State
                        && (trimmed == "p1:"
                            || trimmed == "p2:"
                            || trimmed.starts_with('|')
                            || trimmed.starts_with("p1a:")
                            || trimmed.starts_with("p1b:")
                            || trimmed.starts_with("p2a:")
                            || trimmed.starts_with("p2b:")))
                        || (submode != DirectiveSubmode::Field
                            && (trimmed == "p1:"
                                || trimmed == "p2:"
                                || trimmed.starts_with('|'))
                            && (trimmed.contains("active:")
                                || trimmed.contains("bench:")
                                || trimmed.contains("p1:")
                                || trimmed.contains("p2:")
                                || trimmed.contains("p1a:")
                                || trimmed.contains("p1b:")
                                || trimmed.contains("p2a:")
                                || trimmed.contains("p2b:")))));

            if is_state_line {
                submode = DirectiveSubmode::State;
                let content = if let Some(rest) = trimmed.strip_prefix("@state") {
                    rest.trim()
                } else {
                    trimmed
                };
                if content.is_empty() {
                    continue;
                }
                if content == "p1:" || content == "p2:" {
                    if let Some(cur_turn) = turns.last_mut() {
                        cur_turn.state_effects.push(content.to_string());
                    }
                    continue;
                }
                let item = content.trim_start_matches('|').trim();
                if !item.is_empty() {
                    let segs: Vec<&str> = if item.contains('|') {
                        item.split('|')
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .collect()
                    } else {
                        vec![item]
                    };
                    if let Some(cur_turn) = turns.last_mut() {
                        for seg in segs {
                            cur_turn.state_effects.push(seg.to_string());
                        }
                    }
                }
                continue;
            }

            if (trimmed.starts_with("@poke ") || trimmed.starts_with("@bench "))
                && section == Section::Turn
                && let Some(cur_turn) = turns.last_mut()
            {
                cur_turn.state_effects.push(trimmed.to_string());
                continue;
            }

            submode = DirectiveSubmode::None;

            if let Some(rest) = trimmed.strip_prefix("@cmd ") {
                let act = parse_player_action_cmd(rest, "p1a", "p1b")
                    .map_err(|e| format!("Line {line_num}: {e}"))?;
                if let Some(cur_turn) = turns.last_mut() {
                    cur_turn.p1_action = act;
                }
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@p2cmd ") {
                let act = parse_player_action_cmd(rest, "p2a", "p2b")
                    .map_err(|e| format!("Line {line_num}: {e}"))?;
                if let Some(cur_turn) = turns.last_mut() {
                    cur_turn.p2_action = Some(act);
                }
                continue;
            }

            // 3.5. 1-line block: `move ... { protected }` or `move ... { missed }`
            if trimmed.starts_with("move ")
                && trimmed.ends_with('}')
                && let Some(open_idx) = trimmed.rfind('{')
            {
                let inside = trimmed[open_idx + 1..trimmed.len() - 1].trim();
                if inside == "protected"
                    || inside == "missed"
                    || inside == "failed"
                    || inside == "immune"
                {
                    let move_part = trimmed[..open_idx].trim();
                    let (ev, prov) =
                        parse_event_line(move_part).map_err(|e| format!("Line {line_num}: {e}"))?;
                    let target_opt = if let ObservedEvent::MoveUsed { target, .. } = ev {
                        target
                    } else {
                        None
                    };
                    match section {
                        Section::Lead | Section::Top => {
                            lead_events.push(ev);
                            lead_provenance.push(prov);
                            lead_events.push(ObservedEvent::MoveOutcome {
                                target: target_opt,
                                outcome: inside.to_string(),
                            });
                            lead_provenance.push(EventProvenance::default());
                        }
                        Section::Turn => {
                            if let Some(cur_turn) = turns.last_mut() {
                                cur_turn.events.push(ev);
                                cur_turn.event_provenance.push(prov);
                                cur_turn.events.push(ObservedEvent::MoveOutcome {
                                    target: target_opt,
                                    outcome: inside.to_string(),
                                });
                                cur_turn.event_provenance.push(EventProvenance::default());
                            }
                        }
                    }
                    continue;
                }
            }

            // 3.6. Inline move outcome lines: `move <attacker> <move_id> -> <target>: <outcomes> [| <target2>: <outcomes>]`
            if trimmed.starts_with("move ")
                && trimmed.contains("->")
                && let Some((move_part, targets_part)) = trimmed.split_once("->")
            {
                let targets_part = targets_part.trim();
                if targets_part.contains(':') {
                    let (ev, prov) = parse_event_line(move_part.trim())
                        .map_err(|e| format!("Line {line_num}: {e}"))?;
                    let (last_attacker, last_move_id) = if let ObservedEvent::MoveUsed {
                        attacker,
                        ref move_id,
                        ..
                    } = ev
                    {
                        (Some(attacker), Some(move_id.clone()))
                    } else {
                        (None, None)
                    };
                    match section {
                        Section::Lead | Section::Top => {
                            lead_events.push(ev);
                            lead_provenance.push(prov);
                        }
                        Section::Turn => {
                            if let Some(cur_turn) = turns.last_mut() {
                                cur_turn.events.push(ev);
                                cur_turn.event_provenance.push(prov);
                            }
                        }
                    }

                    let is_spread = targets_part.contains('|');
                    for target_block in targets_part.split('|') {
                        let block = target_block.trim();
                        if block.is_empty() {
                            continue;
                        }
                        let (target_str, outcomes_str) = if let Some(colon_pos) = block.find(':') {
                            (&block[..colon_pos], block[colon_pos + 1..].trim())
                        } else {
                            (block, "")
                        };
                        let target = PokemonIdent::from(target_str.trim());
                        let mut parsed_events = parse_target_outcomes_for_slot(
                            target,
                            outcomes_str,
                            last_attacker,
                            last_move_id.clone(),
                            is_spread,
                        );
                        if let Some(cur_turn) = turns.last() {
                            let mut item_eff = None;
                            for ev in cur_turn.events.iter().rev() {
                                match ev {
                                    ObservedEvent::ItemTriggered { source, item, .. }
                                        if *source == target && item == "life-orb" =>
                                    {
                                        item_eff = Some(item.clone());
                                        break;
                                    }
                                    ObservedEvent::MoveUsed { .. } => break,
                                    _ => {}
                                }
                            }
                            if let Some(eff) = item_eff {
                                for ev in &mut parsed_events {
                                    if let ObservedEvent::Damage {
                                        from_effect,
                                        attacker,
                                        move_id,
                                        ..
                                    } = ev
                                        && from_effect.is_none()
                                    {
                                        *from_effect = Some(eff.clone());
                                        *attacker = None;
                                        *move_id = None;
                                    }
                                }
                            }
                        }
                        for ev in parsed_events {
                            match section {
                                Section::Lead | Section::Top => {
                                    lead_events.push(ev);
                                    lead_provenance.push(EventProvenance::default());
                                }
                                Section::Turn => {
                                    if let Some(cur_turn) = turns.last_mut() {
                                        cur_turn.events.push(ev);
                                        cur_turn.event_provenance.push(EventProvenance::default());
                                    }
                                }
                            }
                        }
                    }
                    continue;
                }
            }

            // 4. Target outcome lines: `target <target>: <outcomes>`, `-> <target>: <outcomes>`, or `<slot>: <outcomes>`
            let line_no_open_brace = trimmed.trim_end_matches('{').trim();
            let is_slot_outcome = (line_no_open_brace.len() >= 4
                && (line_no_open_brace.starts_with("p1a:")
                    || line_no_open_brace.starts_with("p1b:")
                    || line_no_open_brace.starts_with("p2a:")
                    || line_no_open_brace.starts_with("p2b:")))
                || line_no_open_brace.starts_with("target ")
                || line_no_open_brace.starts_with("->");

            if is_slot_outcome {
                let stripped = line_no_open_brace
                    .strip_prefix("target ")
                    .or_else(|| line_no_open_brace.strip_prefix("->"))
                    .unwrap_or(line_no_open_brace);

                let (target_str, outcomes_str) = if let Some(colon_pos) = stripped.find(':') {
                    (&stripped[..colon_pos], stripped[colon_pos + 1..].trim())
                } else {
                    (stripped, "")
                };
                let target = PokemonIdent::from(target_str.trim());

                let (last_attacker, last_move_id) = if let Some(cur_turn) = turns.last() {
                    let mut found = (None, None);
                    for ev in cur_turn.events.iter().rev() {
                        if let ObservedEvent::MoveUsed {
                            attacker, move_id, ..
                        } = ev
                        {
                            found = (Some(*attacker), Some(move_id.clone()));
                            break;
                        }
                    }
                    found
                } else {
                    (None, None)
                };

                let mut parsed_events = parse_target_outcomes_for_slot(
                    target,
                    outcomes_str,
                    last_attacker,
                    last_move_id,
                    true,
                );
                if let Some(cur_turn) = turns.last() {
                    let mut item_eff = None;
                    for ev in cur_turn.events.iter().rev() {
                        match ev {
                            ObservedEvent::ItemTriggered { source, item, .. }
                                if *source == target && item == "life-orb" =>
                            {
                                item_eff = Some(item.clone());
                                break;
                            }
                            ObservedEvent::MoveUsed { .. } => break,
                            _ => {}
                        }
                    }
                    if let Some(eff) = item_eff {
                        for ev in &mut parsed_events {
                            if let ObservedEvent::Damage {
                                from_effect,
                                attacker,
                                move_id,
                                ..
                            } = ev
                                && from_effect.is_none()
                            {
                                *from_effect = Some(eff.clone());
                                *attacker = None;
                                *move_id = None;
                            }
                        }
                    }
                }
                for ev in parsed_events {
                    match section {
                        Section::Lead | Section::Top => {
                            lead_events.push(ev);
                            lead_provenance.push(EventProvenance::default());
                        }
                        Section::Turn => {
                            if let Some(cur_turn) = turns.last_mut() {
                                cur_turn.events.push(ev);
                                cur_turn.event_provenance.push(EventProvenance::default());
                            }
                        }
                    }
                }
                continue;
            }

            // 5. Event lines inside `@lead` or `@turn` (strip trailing `{` if present)
            let line_to_parse = trimmed.trim_end_matches('{').trim();
            if line_to_parse.is_empty() {
                continue;
            }
            let (mut ev, mut prov) =
                parse_event_line(line_to_parse).map_err(|e| format!("Line {line_num}: {e}"))?;
            if prov.comment.as_deref() == Some("protected") {
                prov.comment = Some("protected itself".to_string());
            }
            if let ObservedEvent::SwitchIn {
                player,
                ref species,
                ref mut team_index,
                ..
            } = ev
                && *team_index == 0
            {
                if player == 1 {
                    if let Some(idx) = p1_team
                        .iter()
                        .position(|p| p.species.eq_ignore_ascii_case(species))
                    {
                        *team_index = idx as u8;
                    }
                } else if player == 2
                    && let Some(slot) = p2_preview
                        .iter()
                        .find(|p| p.species.eq_ignore_ascii_case(species))
                {
                    *team_index = slot.preview_index;
                }
            }
            match section {
                Section::Lead | Section::Top => {
                    lead_events.push(ev);
                    lead_provenance.push(prov);
                }
                Section::Turn => {
                    if let Some(cur_turn) = turns.last_mut() {
                        cur_turn.events.push(ev);
                        cur_turn.event_provenance.push(prov);
                    }
                }
            }
        }

        // Normalize provenance vectors: if all entries are empty, clear them to keep JSON clean
        if lead_provenance.iter().all(EventProvenance::is_empty) {
            lead_provenance.clear();
        }
        for t in &mut turns {
            if t.event_provenance.iter().all(EventProvenance::is_empty) {
                t.event_provenance.clear();
            }
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
}

fn format_champions_spread(nature: Option<Nature>, evs: Option<&PokemonEvs>) -> String {
    let nat_str = nature
        .map(|n| format!("{:?}", n))
        .unwrap_or_else(|| "Hardy".to_string());
    let Some(ev) = evs else {
        return nat_str;
    };
    let (buff, nerf) = nature.unwrap_or(Nature::Hardy).modifiers();
    let labels = ["H", "A", "B", "C", "D", "S"];
    let vals = [
        ev.hp.unwrap_or(0),
        ev.atk.unwrap_or(0),
        ev.def.unwrap_or(0),
        ev.spa.unwrap_or(0),
        ev.spd.unwrap_or(0),
        ev.spe.unwrap_or(0),
    ];
    let mut parts = vec![nat_str];
    for i in 0..6 {
        let idx1 = (i + 1) as u8;
        let v = vals[i];
        let suffix = if buff == idx1 {
            "+"
        } else if nerf == idx1 {
            "-"
        } else {
            ""
        };
        if v > 0 || !suffix.is_empty() {
            parts.push(format!("{}{}{}", labels[i], v, suffix));
        }
    }
    parts.join(" ")
}

fn parse_target_outcomes_for_slot(
    target: PokemonIdent,
    outcomes_str: &str,
    last_attacker: Option<PokemonIdent>,
    last_move_id: Option<String>,
    is_spread: bool,
) -> Vec<ObservedEvent> {
    let mut events = Vec::new();
    for outcome_raw in outcomes_str.split(',') {
        let outcome = outcome_raw.trim();
        if outcome.is_empty() {
            continue;
        }
        if outcome == "protected"
            || outcome == "missed"
            || outcome == "failed"
            || outcome == "immune"
        {
            events.push(ObservedEvent::MoveOutcome {
                target: Some(target),
                outcome: outcome.to_string(),
            });
            continue;
        }
        if outcome == "fainted" {
            events.push(ObservedEvent::Faint { target });
            continue;
        }
        if outcome.contains("->") || outcome.contains('%') || outcome.contains('/') {
            let tokens: Vec<&str> = outcome.split_whitespace().collect();
            let hp_after_str = if let Some(arr_idx) = tokens.iter().position(|&t| t == "->") {
                tokens.get(arr_idx + 1).copied().unwrap_or("?")
            } else {
                tokens.first().copied().unwrap_or("?")
            };
            let hp_after = parse_hp(hp_after_str);
            let mut damage_exact = None;
            for tok in &tokens {
                if tok.starts_with("(-") && tok.ends_with(')') {
                    let num_str = tok[2..tok.len() - 1].trim_end_matches('%');
                    damage_exact = num_str.parse::<u16>().ok();
                }
            }
            if damage_exact.is_none()
                && let Some(arr_idx) = tokens.iter().position(|&t| t == "->")
                && arr_idx > 0
            {
                let before_hp = parse_hp(tokens[arr_idx - 1]);
                match (before_hp, hp_after) {
                    (ObservedHp::Percent { percent: b }, ObservedHp::Percent { percent: a })
                        if b >= a =>
                    {
                        damage_exact = Some((b - a) as u16);
                    }
                    (
                        ObservedHp::Exact { current: b, .. },
                        ObservedHp::Exact { current: a, .. },
                    ) if b >= a => {
                        damage_exact = Some(b - a);
                    }
                    _ => {}
                }
            }
            events.push(ObservedEvent::Damage {
                target,
                hp_after,
                damage_exact,
                is_crit: outcome.contains("[crit]") || outcome.contains("crit"),
                effectiveness: if outcome.contains("super-effective") {
                    Some(1)
                } else if outcome.contains("resisted") {
                    Some(-1)
                } else {
                    None
                },
                from_effect: None,
                attacker: last_attacker,
                move_id: last_move_id.clone(),
                is_spread,
            });
        } else if let Some((stat, delta_str)) = outcome.split_once(' ') {
            let delta = delta_str.trim_start_matches('+').parse::<i8>().unwrap_or(0);
            events.push(ObservedEvent::StatStageChanged {
                target,
                stat: stat.trim().to_string(),
                delta,
            });
        }
    }
    events
}

pub(crate) fn parse_nature(s: &str) -> Option<Nature> {
    match s.to_lowercase().as_str() {
        "hardy" => Some(Nature::Hardy),
        "lonely" => Some(Nature::Lonely),
        "brave" => Some(Nature::Brave),
        "adamant" => Some(Nature::Adamant),
        "naughty" => Some(Nature::Naughty),
        "bold" => Some(Nature::Bold),
        "docile" => Some(Nature::Docile),
        "relaxed" => Some(Nature::Relaxed),
        "impish" => Some(Nature::Impish),
        "lax" => Some(Nature::Lax),
        "timid" => Some(Nature::Timid),
        "hasty" => Some(Nature::Hasty),
        "serious" => Some(Nature::Serious),
        "jolly" => Some(Nature::Jolly),
        "naive" => Some(Nature::Naive),
        "modest" => Some(Nature::Modest),
        "mild" => Some(Nature::Mild),
        "quiet" => Some(Nature::Quiet),
        "bashful" => Some(Nature::Bashful),
        "rash" => Some(Nature::Rash),
        "calm" => Some(Nature::Calm),
        "gentle" => Some(Nature::Gentle),
        "sassy" => Some(Nature::Sassy),
        "careful" => Some(Nature::Careful),
        "quirky" => Some(Nature::Quirky),
        _ => None,
    }
}

fn parse_champions_spread(raw: &str) -> (Option<Nature>, Option<PokemonEvs>) {
    let mut nature: Option<Nature> = None;
    let mut evs = PokemonEvs {
        hp: Some(0),
        atk: Some(0),
        def: Some(0),
        spa: Some(0),
        spd: Some(0),
        spe: Some(0),
    };
    let mut any_ev = false;

    for tok in raw.split_whitespace() {
        if let Some(parsed_nat) = parse_nature(tok) {
            nature = Some(parsed_nat);
            continue;
        }
        let t = tok.trim_end_matches(['+', '-']);
        if let Some(num_s) = t.strip_prefix('H')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.hp = Some(v);
            any_ev = true;
        } else if let Some(num_s) = t.strip_prefix('A')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.atk = Some(v);
            any_ev = true;
        } else if let Some(num_s) = t.strip_prefix('B')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.def = Some(v);
            any_ev = true;
        } else if let Some(num_s) = t.strip_prefix('C')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.spa = Some(v);
            any_ev = true;
        } else if let Some(num_s) = t.strip_prefix('D')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.spd = Some(v);
            any_ev = true;
        } else if let Some(num_s) = t.strip_prefix('S')
            && let Ok(v) = num_s.parse::<u8>()
        {
            evs.spe = Some(v);
            any_ev = true;
        }
    }

    (nature, if any_ev { Some(evs) } else { None })
}

fn parse_p1_line(rest: &str, default_idx: usize) -> Result<InputPokemonData, String> {
    let segments: Vec<&str> = rest.split('|').map(str::trim).collect();
    if segments.is_empty() {
        return Err("Empty @p1 line".to_string());
    }

    // Segment 0: `<idx> <species> [@ <item>]`
    let seg0 = segments[0];
    let (left_part, item_opt) = if let Some((l, r)) = seg0.split_once('@') {
        let item_s = r.trim();
        let item = if item_s.is_empty() || item_s == "-" {
            None
        } else {
            Some(item_s.to_string())
        };
        (l.trim(), item)
    } else {
        (seg0, None)
    };

    let mut left_toks = left_part.split_whitespace();
    let first_tok = left_toks.next().ok_or("Missing species in @p1")?;
    let (idx, species) = if let Ok(parsed_idx) = first_tok.parse::<usize>() {
        let sp = left_toks
            .next()
            .ok_or("Missing species after index in @p1")?
            .to_string();
        (parsed_idx, sp)
    } else {
        (default_idx, first_tok.to_string())
    };

    let ability = segments.get(1).and_then(|s| {
        if s.is_empty() || *s == "-" {
            None
        } else {
            Some(s.to_string())
        }
    });

    let (nature, evs) = segments
        .get(2)
        .map(|s| parse_champions_spread(s))
        .unwrap_or((None, None));

    // Segment 3: stats `153,93,98,161,105,167` or `153/153,93,...`
    let meta = pkmn_meta::pokemon_meta::get_pokemon_meta(&species);
    let (buff, nerf) = nature.unwrap_or(Nature::Hardy).modifiers();
    let nmod = |stat_idx: u8| -> i8 {
        if buff == stat_idx {
            1
        } else if nerf == stat_idx {
            -1
        } else {
            0
        }
    };
    let ev_ref = evs.unwrap_or_default();
    let mut hp = meta
        .as_ref()
        .map(|m| m.calc_hp_lv50(ev_ref.hp.unwrap_or(0)) as i32)
        .unwrap_or(150);
    let mut maxhp = hp;
    let mut attack = meta
        .as_ref()
        .map(|m| m.calc_stat_lv50(1, ev_ref.atk.unwrap_or(0), nmod(1)) as i32)
        .unwrap_or(100);
    let mut defense = meta
        .as_ref()
        .map(|m| m.calc_stat_lv50(2, ev_ref.def.unwrap_or(0), nmod(2)) as i32)
        .unwrap_or(100);
    let mut sp_attack = meta
        .as_ref()
        .map(|m| m.calc_stat_lv50(3, ev_ref.spa.unwrap_or(0), nmod(3)) as i32)
        .unwrap_or(100);
    let mut sp_defense = meta
        .as_ref()
        .map(|m| m.calc_stat_lv50(4, ev_ref.spd.unwrap_or(0), nmod(4)) as i32)
        .unwrap_or(100);
    let mut speed = meta
        .as_ref()
        .map(|m| m.calc_stat_lv50(5, ev_ref.spe.unwrap_or(0), nmod(5)) as i32)
        .unwrap_or(100);

    if let Some(stats_seg) = segments.get(3) {
        let parts: Vec<&str> = stats_seg.split(',').map(str::trim).collect();
        if parts.len() == 6 {
            if let Some((cur_s, max_s)) = parts[0].split_once('/') {
                hp = cur_s.parse::<i32>().unwrap_or(hp);
                maxhp = max_s.parse::<i32>().unwrap_or(maxhp);
            } else if let Ok(v) = parts[0].parse::<i32>() {
                hp = v;
                maxhp = v;
            }
            attack = parts[1].parse::<i32>().unwrap_or(attack);
            defense = parts[2].parse::<i32>().unwrap_or(defense);
            sp_attack = parts[3].parse::<i32>().unwrap_or(sp_attack);
            sp_defense = parts[4].parse::<i32>().unwrap_or(sp_defense);
            speed = parts[5].parse::<i32>().unwrap_or(speed);
        }
    }

    let moves: Vec<String> = segments
        .get(4)
        .map(|s| {
            s.split(',')
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty() && m != "-")
                .collect()
        })
        .unwrap_or_default();

    let type1 = meta
        .as_ref()
        .map(|m| format!("{:?}", m.type1()))
        .unwrap_or_else(|| "Normal".to_string());
    let type2 = meta
        .as_ref()
        .and_then(|m| m.type2().map(|t| format!("{:?}", t)));

    let ident = match idx {
        0 => "p1a".to_string(),
        1 => "p1b".to_string(),
        2 => "p1c".to_string(),
        3 => "p1d".to_string(),
        4 => "p1e".to_string(),
        _ => format!("p1slot{idx}"),
    };

    Ok(InputPokemonData {
        ident,
        species,
        hp,
        maxhp,
        attack,
        defense,
        sp_attack,
        sp_defense,
        speed,
        item: item_opt,
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
    })
}

fn parse_p2_line(rest: &str, default_idx: u8) -> Result<OpponentPreviewSlot, String> {
    let segments: Vec<&str> = rest.split('|').map(str::trim).collect();
    let seg0 = segments.first().copied().ok_or("Empty @p2 line")?;
    let (left_part, known_item) = if let Some((l, r)) = seg0.split_once('@') {
        let item_s = r.trim();
        let item = if item_s.is_empty() || item_s == "-" {
            None
        } else {
            Some(item_s.to_string())
        };
        (l.trim(), item)
    } else {
        (seg0, None)
    };

    let mut toks = left_part.split_whitespace();
    let first = toks.next().ok_or("Missing species in @p2")?;
    let (preview_index, species) = if let Ok(idx) = first.parse::<u8>() {
        let sp = toks
            .next()
            .ok_or("Missing species after index in @p2")?
            .to_string();
        (idx, sp)
    } else {
        (default_idx, first.to_string())
    };

    let known_ability = segments.get(1).and_then(|s| {
        if s.is_empty() || *s == "-" {
            None
        } else {
            Some(s.to_string())
        }
    });

    let known_moves = segments
        .get(2)
        .map(|s| {
            s.split(',')
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty() && m != "-")
                .collect()
        })
        .unwrap_or_default();

    Ok(OpponentPreviewSlot {
        preview_index,
        species,
        known_item,
        known_ability,
        known_moves,
    })
}

fn parse_turn_header(rest: &str) -> Result<TurnRecord, String> {
    // Example: `1 @t=12500ms @eval=64.2% @best="p1a:air-slash->p2a +mega, p1b:earthquake" @quality=Best`
    let mut turn_number: u16 = 1;
    let mut annotation = TurnAnnotation::default();
    let mut field_effects = Vec::new();

    let mut cleaned = rest.to_string();
    if let Some(start) = cleaned.find("@field=\"") {
        let after = &cleaned[start + 8..];
        if let Some(end) = after.find('"') {
            let field_str = &after[..end];
            field_effects = field_str
                .split(['|', ','])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            cleaned.replace_range(start..start + 8 + end + 1, "");
        }
    }

    // Extract `@best="..."` if present first
    if let Some(start) = cleaned.find("@best=\"") {
        let after = &cleaned[start + 7..];
        if let Some(end) = after.find('"') {
            let best_str = &after[..end];
            if let Ok(best_act) = parse_player_action_compact(best_str) {
                annotation.best_action = Some(best_act);
            }
            cleaned.replace_range(start..start + 7 + end + 1, "");
        }
    }

    // Extract `@note="..."` if present
    if let Some(start) = cleaned.find("@note=\"") {
        let after = &cleaned[start + 7..];
        if let Some(end) = after.find('"') {
            let note_str = &after[..end];
            annotation.comment = Some(note_str.to_string());
            cleaned.replace_range(start..start + 7 + end + 1, "");
        }
    }

    for (idx, tok) in cleaned.split_whitespace().enumerate() {
        if idx == 0
            && let Ok(n) = tok.parse::<u16>()
        {
            turn_number = n;
            continue;
        }
        if let Some(ts_s) = tok.strip_prefix("@t=") {
            annotation.timestamp_ms = ts_s.trim_end_matches("ms").parse::<u32>().ok();
        } else if let Some(eval_s) = tok.strip_prefix("@eval=") {
            let clean_eval = eval_s.trim_start_matches('+').trim_end_matches('%');
            if let Ok(pct) = clean_eval.parse::<f64>() {
                annotation.eval_win_rate = Some((pct / 100.0).clamp(0.0, 1.0));
            }
        } else if let Some(q_s) = tok.strip_prefix("@quality=") {
            annotation.action_quality = match q_s.to_lowercase().as_str() {
                "best" => Some(ActionQuality::Best),
                "good" => Some(ActionQuality::Good),
                "inaccuracy" => Some(ActionQuality::Inaccuracy),
                "blunder" => Some(ActionQuality::Blunder),
                _ => None,
            };
        }
    }

    Ok(TurnRecord {
        turn_number,
        annotation,
        field_effects,
        ..Default::default()
    })
}

fn target_i8_to_ident_str(target: i8, actor_player: u8) -> Option<&'static str> {
    match (actor_player, target) {
        (1, 1) => Some("p2a"),
        (1, 2) => Some("p2b"),
        (1, -1) => Some("p1a"),
        (1, -2) => Some("p1b"),
        (2, 1) => Some("p1a"),
        (2, 2) => Some("p1b"),
        (2, -1) => Some("p2a"),
        (2, -2) => Some("p2b"),
        _ => None,
    }
}

fn ident_str_to_target_i8(ident_s: &str, actor_player: u8) -> i8 {
    if let Ok(num) = ident_s.parse::<i8>() {
        return num;
    }
    match (actor_player, ident_s.to_lowercase().as_str()) {
        (1, "p2a") => 1,
        (1, "p2b") => 2,
        (1, "p1a") => -1,
        (1, "p1b") => -2,
        (2, "p1a") => 1,
        (2, "p1b") => 2,
        (2, "p2a") => -1,
        (2, "p2b") => -2,
        _ => 0,
    }
}

fn format_slot_action_cmd(slot: &SlotActionJs, actor_player: u8) -> String {
    let mut s = slot.choice.clone();
    if let Some(t_str) = target_i8_to_ident_str(slot.target, actor_player) {
        let _ = write!(s, " -> {t_str}");
    } else if slot.target != 0 {
        let _ = write!(s, " -> {}", slot.target);
    }
    if slot.mega {
        s.push_str(" +mega");
    }
    s
}

fn format_player_action_cmd(act: &PlayerActionJs, label_a: &str, label_b: &str) -> String {
    let player = if label_a.starts_with("p1") { 1 } else { 2 };
    format!(
        "{}: {} | {}: {}",
        label_a,
        format_slot_action_cmd(&act.slot_a, player),
        label_b,
        format_slot_action_cmd(&act.slot_b, player)
    )
}

fn format_player_action_compact(act: &PlayerActionJs, player: u8) -> String {
    let (la, lb) = if player == 1 {
        ("p1a", "p1b")
    } else {
        ("p2a", "p2b")
    };
    format!(
        "{}:{}, {}:{}",
        la,
        format_slot_action_cmd(&act.slot_a, player),
        lb,
        format_slot_action_cmd(&act.slot_b, player)
    )
}

fn parse_single_slot_action(raw: &str, actor_player: u8) -> SlotActionJs {
    let mut s = raw.trim();
    if let Some((_, rhs)) = s.split_once(':') {
        s = rhs.trim();
    }
    let mut mega = false;
    if let Some(stripped) = s.strip_suffix("+mega") {
        mega = true;
        s = stripped.trim();
    }
    let (choice_part, target) = if let Some((c, t)) = s.split_once("->") {
        (c.trim(), ident_str_to_target_i8(t.trim(), actor_player))
    } else {
        (s.trim(), 0)
    };
    SlotActionJs {
        choice: choice_part.to_string(),
        target,
        mega,
    }
}

fn parse_player_action_cmd(
    raw: &str,
    label_a: &str,
    _label_b: &str,
) -> Result<PlayerActionJs, String> {
    let player = if label_a.starts_with("p1") { 1 } else { 2 };
    let parts: Vec<&str> = raw.split('|').collect();
    let slot_a = parts
        .first()
        .map(|p| parse_single_slot_action(p, player))
        .unwrap_or_default();
    let slot_b = parts
        .get(1)
        .map(|p| parse_single_slot_action(p, player))
        .unwrap_or_default();
    Ok(PlayerActionJs { slot_a, slot_b })
}

fn parse_player_action_compact(raw: &str) -> Result<PlayerActionJs, String> {
    let parts: Vec<&str> = raw.split(',').collect();
    let slot_a = parts
        .first()
        .map(|p| parse_single_slot_action(p, 1))
        .unwrap_or_default();
    let slot_b = parts
        .get(1)
        .map(|p| parse_single_slot_action(p, 1))
        .unwrap_or_default();
    Ok(PlayerActionJs { slot_a, slot_b })
}

fn format_hp(hp: ObservedHp) -> String {
    match hp {
        ObservedHp::Exact { current, max } => format!("{current}/{max}"),
        ObservedHp::Percent { percent } => format!("{percent}%"),
        ObservedHp::Unknown => "?".to_string(),
    }
}

fn parse_hp(s: &str) -> ObservedHp {
    let t = s.trim();
    if t == "?" || t.eq_ignore_ascii_case("unknown") {
        ObservedHp::Unknown
    } else if let Some(pct_s) = t.strip_suffix('%') {
        ObservedHp::Percent {
            percent: pct_s.parse::<u8>().unwrap_or(0).min(100),
        }
    } else if let Some((c_s, m_s)) = t.split_once('/') {
        ObservedHp::Exact {
            current: c_s.parse::<u16>().unwrap_or(0),
            max: m_s.parse::<u16>().unwrap_or(1),
        }
    } else {
        ObservedHp::Unknown
    }
}

fn format_event_line(ev: &ObservedEvent, prov: Option<&EventProvenance>) -> String {
    let mut line = match ev {
        ObservedEvent::SwitchIn {
            player,
            slot,
            team_index: _,
            species,
            hp,
        } => {
            let ident = PokemonIdent {
                player: *player,
                slot: *slot,
            };
            format!("switch {} {} {}", ident, species, format_hp(*hp))
        }
        ObservedEvent::MegaEvolve {
            target,
            mega_species,
            item: _,
        } => format!("mega {} {}", target, mega_species),
        ObservedEvent::MoveUsed {
            attacker,
            move_id,
            target,
        } => {
            if let Some(t) = target {
                format!("move {} {} -> {}", attacker, move_id, t)
            } else {
                format!("move {} {}", attacker, move_id)
            }
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
            let mut s = match (*hp_after, *damage_exact) {
                (ObservedHp::Percent { percent }, Some(d)) => {
                    let before = (percent as u16 + d).min(100);
                    format!("damage {} {}% -> {}%", target, before, percent)
                }
                (ObservedHp::Exact { current, max }, Some(d)) => {
                    let before = current + d;
                    format!(
                        "damage {} {}/{} -> {}/{}",
                        target, before, max, current, max
                    )
                }
                _ => format!("damage {} {}", target, format_hp(*hp_after)),
            };
            let mut mods = Vec::new();
            if let Some(atk) = attacker {
                mods.push(format!("from={atk}"));
            }
            if let Some(m) = move_id {
                mods.push(format!("move={m}"));
            }
            if let Some(eff) = from_effect {
                mods.push(format!("effect={eff}"));
            }
            if let Some(e) = effectiveness {
                mods.push(format!("eff={e}"));
            }
            if *is_crit {
                mods.push("crit".to_string());
            }
            if *is_spread {
                mods.push("spread".to_string());
            }
            if !mods.is_empty() {
                let _ = write!(s, " [{}]", mods.join(", "));
            }
            s
        }
        ObservedEvent::Heal {
            target,
            hp_after,
            from_effect,
        } => {
            let mut s = format!("heal {} {}", target, format_hp(*hp_after));
            if let Some(eff) = from_effect {
                let _ = write!(s, " [{eff}]");
            }
            s
        }
        ObservedEvent::AbilityTriggered { source, ability } => {
            format!("ability {} {}", source, ability)
        }
        ObservedEvent::ItemTriggered {
            source,
            item,
            consumed,
        } => {
            if *consumed {
                format!("item {} {} consumed", source, item)
            } else {
                format!("item {} {}", source, item)
            }
        }
        ObservedEvent::StatStageChanged {
            target,
            stat,
            delta,
        } => {
            if *delta >= 0 {
                format!("boost {} {} +{}", target, stat, delta)
            } else {
                format!("boost {} {} {}", target, stat, delta)
            }
        }
        ObservedEvent::StatusChanged {
            target,
            status,
            is_cure,
            from_effect,
        } => {
            let prefix = if *is_cure { "-" } else { "+" };
            let st = status.as_deref().unwrap_or("none");
            let mut s = format!("status {} {}{}", target, prefix, st);
            if let Some(eff) = from_effect {
                let _ = write!(s, " [{eff}]");
            }
            s
        }
        ObservedEvent::CantMove {
            target,
            reason,
            move_id,
        } => {
            let mut s = format!("cant {} {}", target, reason);
            if let Some(mv) = move_id {
                let _ = write!(s, " {}", mv);
            }
            s
        }
        ObservedEvent::MoveOutcome { target, outcome } => {
            if let Some(t) = target {
                format!("target {}: {}", t, outcome)
            } else {
                outcome.clone()
            }
        }
        ObservedEvent::WeatherChanged { weather } => {
            format!("weather {}", weather.as_deref().unwrap_or("None"))
        }
        ObservedEvent::TerrainChanged { terrain } => {
            format!("terrain {}", terrain.as_deref().unwrap_or("None"))
        }
        ObservedEvent::FieldConditionChanged { condition, active } => {
            format!("field {} {}", condition, if *active { "on" } else { "off" })
        }
        ObservedEvent::SideConditionChanged {
            player,
            condition,
            active,
        } => {
            let p_str = if *player == 1 { "p1" } else { "p2" };
            format!(
                "side {} {} {}",
                p_str,
                condition,
                if *active { "on" } else { "off" }
            )
        }
        ObservedEvent::Faint { target } => format!("faint {}", target),
    };

    if let Some(p) = prov {
        if p.needs_review {
            line.push_str(" @review");
        }
        if let Some(ts) = p.timestamp_ms {
            let _ = write!(line, " @t={}ms", ts);
        }
        if let Some(conf) = p.confidence {
            let _ = write!(line, " @conf={}%", conf);
        }
        if let Some(ref note) = p.note {
            let _ = write!(line, " @note=\"{}\"", note.trim());
        }
        if let Some(ref c) = p.comment {
            let _ = write!(line, " [{}]", c.trim());
        }
    }

    line
}

fn parse_event_line(raw: &str) -> Result<(ObservedEvent, EventProvenance), String> {
    let mut s = raw.trim().to_string();
    let mut prov = EventProvenance::default();

    // 1. Extract trailing `{ comment }` if present
    if let Some(open_brace) = s.rfind('{')
        && s.ends_with('}')
    {
        let comment = s[open_brace + 1..s.len() - 1].trim().to_string();
        prov.comment = Some(comment);
        s.truncate(open_brace);
        s = s.trim().to_string();
    }

    // 1.5. Extract `@note="..."` if present
    if let Some(start) = s.find("@note=\"") {
        let after = &s[start + 7..];
        if let Some(end) = after.find('"') {
            let note_str = &after[..end];
            prov.note = Some(note_str.to_string());
            let mut without_note = s[..start].to_string();
            without_note.push_str(&after[end + 1..]);
            s = without_note;
        }
    }

    // 2. Extract all `[...]` bracket blocks, distinguishing event modifiers from comments
    let mut bracket_part: Option<String> = None;
    while let Some(b_start) = s.find('[') {
        if let Some(b_len) = s[b_start..].find(']') {
            let b_end = b_start + b_len;
            let b_content = s[b_start + 1..b_end].trim().to_string();
            s = format!("{}{}", &s[..b_start], &s[b_end + 1..]);

            let is_modifier = b_content.contains('=')
                || b_content == "crit"
                || b_content == "spread"
                || b_content == "super-effective"
                || b_content == "resisted";

            if is_modifier {
                bracket_part = Some(b_content);
            } else if prov.comment.is_none() {
                prov.comment = Some(b_content);
            }
        } else {
            break;
        }
    }

    // 3. Extract `@t=`, `@conf=`, `@review` tokens
    let mut remaining_tokens = Vec::new();
    for tok in s.split_whitespace() {
        if let Some(ts_s) = tok.strip_prefix("@t=") {
            prov.timestamp_ms = ts_s.trim_end_matches("ms").parse::<u32>().ok();
        } else if let Some(c_s) = tok.strip_prefix("@conf=") {
            prov.confidence = c_s.trim_end_matches('%').parse::<u8>().ok();
        } else if tok == "@review" {
            prov.needs_review = true;
        } else {
            remaining_tokens.push(tok);
        }
    }

    let cmd = *remaining_tokens.first().ok_or("Empty event line")?;
    let args = &remaining_tokens[1..];

    let event = match cmd {
        "switch" => {
            if args.len() < 3 {
                return Err("switch requires `<ident> <species> <hp>`".to_string());
            }
            let ident = PokemonIdent::from(args[0]);
            let (team_index, species, hp) = if args.len() >= 4 && args[1].starts_with('#') {
                let tidx = args[1].trim_start_matches('#').parse::<u8>().unwrap_or(0);
                (tidx, args[2].to_string(), parse_hp(args[3]))
            } else {
                (0, args[1].to_string(), parse_hp(args[2]))
            };
            ObservedEvent::SwitchIn {
                player: ident.player,
                slot: ident.slot,
                team_index,
                species,
                hp,
            }
        }
        "mega" => {
            if args.len() < 2 {
                return Err("mega requires `<ident> <mega_species>`".to_string());
            }
            let item = if args.len() >= 3 {
                args[2].to_string()
            } else {
                "-".to_string()
            };
            ObservedEvent::MegaEvolve {
                target: PokemonIdent::from(args[0]),
                mega_species: args[1].to_string(),
                item,
            }
        }
        "move" => {
            if args.len() < 2 {
                return Err("move requires `<attacker> <move_id>`".to_string());
            }
            let attacker = PokemonIdent::from(args[0]);
            let move_id = args[1].to_string();
            let target = if args.len() >= 4 && args[2] == "->" {
                Some(PokemonIdent::from(args[3]))
            } else {
                None
            };
            ObservedEvent::MoveUsed {
                attacker,
                move_id,
                target,
            }
        }
        "cant" => {
            if args.len() < 2 {
                return Err("cant requires `<target> <reason>`".to_string());
            }
            let target = PokemonIdent::from(args[0]);
            let reason = args[1].to_string();
            let move_id = args.get(2).map(|s| s.to_string());
            ObservedEvent::CantMove {
                target,
                reason,
                move_id,
            }
        }
        "damage" => {
            if args.len() < 2 {
                return Err("damage requires `<target> <hp_after>`".to_string());
            }
            let target = PokemonIdent::from(args[0]);
            let (hp_after_token, damage_token_idx) =
                if let Some(arrow_idx) = args.iter().position(|&x| x == "->") {
                    if arrow_idx + 1 < args.len() {
                        (args[arrow_idx + 1], arrow_idx + 2)
                    } else {
                        (args[1], 2)
                    }
                } else {
                    (args[1], 2)
                };
            let hp_after = parse_hp(hp_after_token);
            let mut damage_exact = None;
            if let Some(dmg_arg) = args.get(damage_token_idx)
                && dmg_arg.starts_with("(-")
                && dmg_arg.ends_with(')')
            {
                let num_str = dmg_arg[2..dmg_arg.len() - 1].trim_end_matches('%');
                damage_exact = num_str.parse::<u16>().ok();
            }
            if damage_exact.is_none()
                && let Some(arrow_idx) = args.iter().position(|&x| x == "->")
                && arrow_idx > 1
            {
                let hp_before = parse_hp(args[arrow_idx - 1]);
                match (hp_before, hp_after) {
                    (ObservedHp::Percent { percent: b }, ObservedHp::Percent { percent: a })
                        if b >= a =>
                    {
                        damage_exact = Some((b - a) as u16);
                    }
                    (
                        ObservedHp::Exact { current: b, .. },
                        ObservedHp::Exact { current: a, .. },
                    ) if b >= a => {
                        damage_exact = Some(b - a);
                    }
                    _ => {}
                }
            }
            let mut is_crit = false;
            let mut is_spread = false;
            let mut effectiveness = None;
            let mut from_effect = None;
            let mut attacker = None;
            let mut move_id = None;

            if let Some(ref b_str) = bracket_part {
                for item in b_str.split(',').map(str::trim) {
                    if item == "crit" {
                        is_crit = true;
                    } else if item == "spread" {
                        is_spread = true;
                    } else if let Some(v) = item.strip_prefix("move=") {
                        move_id = Some(v.to_string());
                    } else if let Some(v) = item.strip_prefix("from=") {
                        attacker = Some(PokemonIdent::from(v));
                    } else if let Some(v) = item.strip_prefix("effect=") {
                        from_effect = Some(v.to_string());
                    } else if let Some(v) = item.strip_prefix("eff=") {
                        effectiveness = v.parse::<i8>().ok();
                    } else if !item.is_empty() && from_effect.is_none() {
                        from_effect = Some(item.to_string());
                    }
                }
            }
            if from_effect.is_none() && args.len() > damage_token_idx {
                from_effect = Some(args[damage_token_idx].trim_matches(['[', ']']).to_string());
            }

            if from_effect.is_none()
                && let Some(ref c) = prov.comment
                && !c.is_empty()
                && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
            {
                from_effect = prov.comment.take();
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
            }
        }
        "heal" => {
            if args.is_empty() {
                return Err("heal requires `<target>`".to_string());
            }
            let target = PokemonIdent::from(args[0]);
            let hp_after_token = if let Some(arrow_idx) = args.iter().position(|&x| x == "->") {
                if arrow_idx + 1 < args.len() {
                    args[arrow_idx + 1]
                } else {
                    args.get(1).copied().unwrap_or("?")
                }
            } else if args.len() >= 2 {
                args[1]
            } else {
                "?"
            };
            let hp_after = parse_hp(hp_after_token);
            let mut from_effect = None;
            if let Some(ref b_str) = bracket_part {
                for item in b_str.split(',').map(str::trim) {
                    if let Some(v) = item.strip_prefix("effect=") {
                        from_effect = Some(v.to_string());
                    } else if !item.is_empty() {
                        from_effect = Some(item.to_string());
                    }
                }
            }
            if from_effect.is_none()
                && let Some(ref c) = prov.comment
                && !c.is_empty()
                && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
            {
                from_effect = prov.comment.take();
            }
            ObservedEvent::Heal {
                target,
                hp_after,
                from_effect,
            }
        }
        "ability" => {
            if args.len() < 2 {
                return Err("ability requires `<source> <ability>`".to_string());
            }
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from(args[0]),
                ability: args[1].to_string(),
            }
        }
        "item" => {
            if args.len() < 2 {
                return Err("item requires `<source> <item>`".to_string());
            }
            let consumed = args.get(2).is_some_and(|&s| s == "consumed");
            ObservedEvent::ItemTriggered {
                source: PokemonIdent::from(args[0]),
                item: args[1].to_string(),
                consumed,
            }
        }
        "boost" => {
            if args.len() < 3 {
                return Err("boost requires `<target> <stat> <delta>`".to_string());
            }
            let delta = args[2].trim_start_matches('+').parse::<i8>().unwrap_or(0);
            ObservedEvent::StatStageChanged {
                target: PokemonIdent::from(args[0]),
                stat: args[1].to_string(),
                delta,
            }
        }
        "status" => {
            if args.len() < 2 {
                return Err("status requires `<target> <status>`".to_string());
            }
            let target = PokemonIdent::from(args[0]);
            let raw_st = args[1];
            let (is_cure, st_name) = if let Some(stripped) = raw_st.strip_prefix('+') {
                (false, stripped)
            } else if let Some(stripped) = raw_st.strip_prefix('-') {
                (true, stripped)
            } else if raw_st.eq_ignore_ascii_case("none") {
                (true, "none")
            } else {
                (false, raw_st)
            };
            let status = if st_name.eq_ignore_ascii_case("none") {
                None
            } else {
                Some(st_name.to_string())
            };
            let from_effect = if let Some(ref b) = bracket_part {
                Some(b.clone())
            } else if args.len() >= 3 {
                Some(args[2].trim_matches(['[', ']']).to_string())
            } else {
                None
            };
            ObservedEvent::StatusChanged {
                target,
                status,
                is_cure,
                from_effect,
            }
        }
        "weather" => {
            let w = args.first().copied().unwrap_or("None");
            let weather = if w.eq_ignore_ascii_case("none") {
                None
            } else {
                Some(w.to_string())
            };
            ObservedEvent::WeatherChanged { weather }
        }
        "terrain" => {
            let t = args.first().copied().unwrap_or("None");
            let terrain = if t.eq_ignore_ascii_case("none") {
                None
            } else {
                Some(t.to_string())
            };
            ObservedEvent::TerrainChanged { terrain }
        }
        "field" => {
            if args.len() < 2 {
                return Err("field requires `<condition> <on|off>`".to_string());
            }
            ObservedEvent::FieldConditionChanged {
                condition: args[0].to_string(),
                active: args[1].eq_ignore_ascii_case("on") || args[1] == "true",
            }
        }
        "side" => {
            if args.len() < 3 {
                return Err("side requires `<p1|p2> <condition> <on|off>`".to_string());
            }
            let player = if args[0].eq_ignore_ascii_case("p2") {
                2
            } else {
                1
            };
            ObservedEvent::SideConditionChanged {
                player,
                condition: args[1].to_string(),
                active: args[2].eq_ignore_ascii_case("on") || args[2] == "true",
            }
        }
        "faint" => {
            if args.is_empty() {
                return Err("faint requires `<target>`".to_string());
            }
            ObservedEvent::Faint {
                target: PokemonIdent::from(args[0]),
            }
        }
        "perish" => {
            let (target, after_count) = if args.len() >= 4 && args[2] == "->" {
                (PokemonIdent::from(args[0]), args[3])
            } else if args.len() >= 3 && args[1] == "->" {
                (PokemonIdent::from(args[0]), args[2])
            } else if args.len() >= 2 {
                (PokemonIdent::from(args[0]), args[1])
            } else {
                return Err("perish requires `<target> <from> -> <to>`".to_string());
            };
            ObservedEvent::StatusChanged {
                target,
                status: Some(format!("perish{after_count}")),
                is_cure: after_count == "0",
                from_effect: Some("perish-song".to_string()),
            }
        }
        other => return Err(format!("Unknown PBN event command: '{other}'")),
    };

    Ok((event, prov))
}
