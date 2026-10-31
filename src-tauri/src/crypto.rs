use argon2::Argon2;
use rand::RngCore;

pub const SALT_LEN: usize = 16;
pub const KEY_LEN: usize = 32;

/// Derives a 32-byte encryption key from a user passphrase and a salt using Argon2id.
pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let mut key = [0u8; KEY_LEN];
    let argon2 = Argon2::default();
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Key derivation error: {e}"))?;
    Ok(key)
}

/// Generates a cryptographically secure random salt of 16 bytes.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Formats a byte array as a lowercase hexadecimal string.
pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_key_deterministic() {
        let salt = [42u8; SALT_LEN];
        let key1 = derive_key("admin123", &salt).unwrap();
        let key2 = derive_key("admin123", &salt).unwrap();
        assert_eq!(key1, key2);

        let key_wrong = derive_key("wrong_password", &salt).unwrap();
        assert_ne!(key1, key_wrong);
    }

    #[test]
    fn test_to_hex() {
        let bytes = [0x01, 0x0f, 0xa5, 0xff];
        assert_eq!(to_hex(&bytes), "010fa5ff");
    }
}
