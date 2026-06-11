#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32");

extern crate alloc;

use alloc::string::String;
use casper_contract::{
    contract_api::{account, runtime, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{runtime_args, CLTyped, ContractHash, RuntimeArgs, U512};

#[no_mangle]
pub extern "C" fn call() {
    // 1. Get arguments passed from the JS SDK
    let contract_hash: ContractHash = runtime::get_named_arg("c9f2b19119304db6f4487777c11c22e45e054299f50207ed90b4bd2205e3dca2");
    let amount: U512 = runtime::get_named_arg("amount");
    let entry_point: String = runtime::get_named_arg("deposit");

    // 2. Create a temporary purse for the transfer
    let temp_purse = system::create_purse();

    // 3. Move CSPR from your main account purse to the temporary purse
    let main_purse = account::get_main_purse();
    system::transfer_from_purse_to_purse(main_purse, temp_purse, amount, None)
        .unwrap_or_revert();

    // 4. Call the Odra contract. 
    // We pass the "amount" and the "purse" as arguments.
    // Odra's #[payable] attribute logic will look for these to verify the payment.
    let mut args = RuntimeArgs::new();
    args.insert("amount", amount).unwrap_or_revert();
    args.insert("purse", temp_purse).unwrap_or_revert();

    // Call the actual 'deposit' function (or whatever is in entry_point)
    runtime::call_contract::<()>(contract_hash, &entry_point, args);
}