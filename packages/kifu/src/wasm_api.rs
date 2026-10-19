use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn format_kifu_to_pbn(
    kifu: tsify::Ts<crate::BattleKifu>,
) -> Result<String, wasm_bindgen::JsError> {
    let kifu_rust: crate::BattleKifu = kifu
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
    Ok(kifu_rust.to_pbn())
}

#[wasm_bindgen]
pub fn parse_pbn_to_kifu(
    pbn_text: &str,
) -> Result<tsify::Ts<crate::BattleKifu>, wasm_bindgen::JsError> {
    let kifu = crate::BattleKifu::from_pbn(pbn_text)
        .map_err(|e| wasm_bindgen::JsError::new(e.as_str()))?;
    tsify::Ts::from_rust(&kifu).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn encode_kifu_to_pkf(
    kifu: tsify::Ts<crate::BattleKifu>,
) -> Result<Vec<u8>, wasm_bindgen::JsError> {
    let kifu_rust: crate::BattleKifu = kifu
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
    Ok(kifu_rust.to_pkf_bytes())
}

#[wasm_bindgen]
pub fn decode_pkf_to_kifu(
    pkf_bytes: &[u8],
) -> Result<tsify::Ts<crate::BattleKifu>, wasm_bindgen::JsError> {
    let kifu = crate::BattleKifu::from_pkf_bytes(pkf_bytes)
        .map_err(|e| wasm_bindgen::JsError::new(e.as_str()))?;
    tsify::Ts::from_rust(&kifu).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn encode_kifu_to_pkf_base64url(
    kifu: tsify::Ts<crate::BattleKifu>,
) -> Result<String, wasm_bindgen::JsError> {
    let kifu_rust: crate::BattleKifu = kifu
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
    Ok(kifu_rust.to_pkf_base64url())
}

#[wasm_bindgen]
pub fn decode_pkf_base64url_to_kifu(
    encoded: &str,
) -> Result<tsify::Ts<crate::BattleKifu>, wasm_bindgen::JsError> {
    let kifu = crate::BattleKifu::from_pkf_base64url(encoded)
        .map_err(|e| wasm_bindgen::JsError::new(e.as_str()))?;
    tsify::Ts::from_rust(&kifu).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}
