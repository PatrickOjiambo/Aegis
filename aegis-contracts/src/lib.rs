#![cfg_attr(not(any(test, feature = "livenet")), no_std)]
#![cfg_attr(not(any(test, feature = "livenet")), no_main)]
extern crate alloc;

pub mod escrow;
pub mod flipper;
pub mod reputation;
