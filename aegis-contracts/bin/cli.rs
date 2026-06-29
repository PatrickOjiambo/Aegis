//! odra-cli livenet driver for Aegis Contract B (ReputationRegistry).
//!
//! Deploys the registry to a live Casper network and exposes the simplest
//! real Aegis on-chain action — `add_writer` (owner-gated) — as a scenario.
//!
//! Network/keys are read from `.env` (ODRA_CASPER_LIVENET_*) by odra.

use aegis_contracts::reputation::ReputationRegistry;
use odra::host::{HostEnv, NoArgs};
use odra::prelude::Address;
use odra::schema::casper_contract_schema::NamedCLType;
use odra_cli::{
    deploy::DeployScript,
    scenario::{Args, Error, Scenario, ScenarioMetadata},
    CommandArg, ContractProvider, DeployedContractsContainer, DeployerExt, OdraCli,
};

/// Deploys `ReputationRegistry` (deployer becomes owner) into the container.
pub struct ReputationDeployScript;

impl DeployScript for ReputationDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer,
    ) -> Result<(), odra_cli::deploy::Error> {
        let _registry = ReputationRegistry::load_or_deploy(
            env,
            NoArgs,
            container,
            350_000_000_000, // install gas limit (motes)
        )?;
        Ok(())
    }
}

/// Registers an address as an authorized writer. Owner only.
pub struct AddWriterScenario;

impl Scenario for AddWriterScenario {
    fn args(&self) -> Vec<CommandArg> {
        vec![CommandArg::new(
            "writer",
            "Address (account-hash-... or hash-...) to authorize as a writer",
            NamedCLType::Key,
        )]
    }

    fn run(
        &self,
        env: &HostEnv,
        container: &DeployedContractsContainer,
        args: Args,
    ) -> Result<(), Error> {
        let mut registry = container.contract_ref::<ReputationRegistry>(env)?;
        let writer = args.get_single::<Address>("writer")?;
        env.set_gas(2_000_000_000);
        registry.try_add_writer(writer)?;
        Ok(())
    }
}

impl ScenarioMetadata for AddWriterScenario {
    const NAME: &'static str = "add_writer";
    const DESCRIPTION: &'static str =
        "Authorize an address as a ReputationRegistry writer (owner only)";
}

pub fn main() {
    OdraCli::new()
        .about("CLI tool for Aegis ReputationRegistry")
        .deploy(ReputationDeployScript)
        .contract::<ReputationRegistry>()
        .scenario(AddWriterScenario)
        .build()
        .run();
}
