import fs from "node:fs";
import path from "node:path";
import { Interface } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Operational tasks for the MaticX sunset (v2 — recall-and-hold).
 *
 *   hardhat sunset:deploy-impl    --network ethereum
 *   hardhat sunset:encode-upgrade --network ethereum   # multisig/timelock calldata
 *   hardhat sunset:verify-upgrade --network ethereum   # post-upgrade smoke
 *   hardhat sunset:status         --network ethereum   # state dump at every step
 *   hardhat sunset:encode-step    --step <name> [--arg <value>]
 *
 * Steps for encode-step: pause | bulk-unstake | claim-recall | freeze |
 *                        push-l2 | enable-instant-redeem | disable-instant-redeem |
 *                        set-custody-delay | sweep
 */

// 2 years (730 days) — sweep window before residual assets can be moved to custody
const CUSTODY_DELAY_SECONDS = 730n * 24n * 60n * 60n;

const TIMELOCK_SALT_TEXT = "MATICX_SUNSET_V2_UPGRADE";
const PROXY_ADMIN_ABI = [
	"function upgrade(address proxy, address impl) external",
	"function getProxyImplementation(address proxy) view returns (address)",
];
const TIMELOCK_ABI = [
	"function getMinDelay() view returns (uint256)",
	"function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
	"function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) payable",
];

interface DeploymentInfo {
	eth_maticX_proxy: string;
	eth_proxy_admin: string;
	eth_multisig: string;
	manager: string;
	[key: string]: string;
}

function deploymentPath(network: string): string {
	const candidates = [
		`${network}-deployment-info.json`,
		network === "mainnet" || network === "ethereum"
			? "mainnet-deployment-info.json"
			: null,
	].filter(Boolean) as string[];
	for (const c of candidates) {
		const p = path.join(process.cwd(), c);
		if (fs.existsSync(p)) return p;
	}
	throw new Error(
		`No deployment-info.json found for network "${network}". Tried: ${candidates.join(", ")}`
	);
}

function readDeployment(network: string): DeploymentInfo {
	return JSON.parse(fs.readFileSync(deploymentPath(network), "utf8"));
}

function writeDeploymentField(
	network: string,
	key: string,
	value: string
): void {
	const file = deploymentPath(network);
	const current = JSON.parse(fs.readFileSync(file, "utf8"));
	current[key] = value;
	fs.writeFileSync(file, JSON.stringify(current, null, "\t") + "\n");
	console.log(`  saved ${key} = ${value} -> ${path.basename(file)}`);
}

task("sunset:deploy-impl")
	.setDescription(
		"Validates storage layout and deploys the new MaticX sunset implementation"
	)
	.setAction(async (_args, hre: HardhatRuntimeEnvironment) => {
		const network = hre.network.name;
		const dep = readDeployment(network);
		const Factory = await hre.ethers.getContractFactory("MaticX");

		console.log("Validating storage-layout compatibility...");
		await hre.upgrades.validateUpgrade(dep.eth_maticX_proxy, Factory, {
			kind: "transparent",
		});

		console.log("Deploying new MaticX implementation...");
		const implAddress = await hre.upgrades.deployImplementation(Factory, {
			kind: "transparent",
		});
		console.log("  implementation:", implAddress);

		writeDeploymentField(
			network,
			"eth_maticX_sunset_impl",
			implAddress as string
		);
		console.log("\nNext: hardhat sunset:encode-upgrade --network", network);
	});

task("sunset:encode-upgrade")
	.setDescription(
		"Emits proxy-admin upgrade() calldata. Optionally wraps in a Timelock schedule/execute pair."
	)
	.addOptionalParam<string>(
		"timelock",
		"Timelock address — if provided, emits Timelock-wrapped calldata",
		undefined,
		types.string
	)
	.setAction(
		async (
			{ timelock }: { timelock?: string },
			hre: HardhatRuntimeEnvironment
		) => {
			const network = hre.network.name;
			const dep = readDeployment(network);
			const impl = dep.eth_maticX_sunset_impl;
			if (!impl) {
				throw new Error(
					"eth_maticX_sunset_impl missing. Run sunset:deploy-impl first."
				);
			}

			const proxyAdmin = new hre.ethers.Interface(PROXY_ADMIN_ABI);
			const upgradeData = proxyAdmin.encodeFunctionData("upgrade", [
				dep.eth_maticX_proxy,
				impl,
			]);

			console.log("Proxy admin:", dep.eth_proxy_admin);
			console.log("Upgrade calldata (proxy admin → upgrade):");
			console.log(" ", upgradeData);

			if (!timelock) return;

			const tl = await hre.ethers.getContractAt(TIMELOCK_ABI, timelock);
			const delay: bigint = await tl.getMinDelay();
			const iface = new hre.ethers.Interface(TIMELOCK_ABI);
			const salt = hre.ethers.id(TIMELOCK_SALT_TEXT);
			const scheduleData = iface.encodeFunctionData("schedule", [
				dep.eth_proxy_admin,
				0n,
				upgradeData,
				hre.ethers.ZeroHash,
				salt,
				delay,
			]);
			const executeData = iface.encodeFunctionData("execute", [
				dep.eth_proxy_admin,
				0n,
				upgradeData,
				hre.ethers.ZeroHash,
				salt,
			]);

			console.log("\nTimelock:", timelock);
			console.log(`Schedule (delay ${delay}s):`);
			console.log(" ", scheduleData);
			console.log("Execute (after delay):");
			console.log(" ", executeData);
		}
	);

task("sunset:verify-upgrade")
	.setDescription(
		"Verifies post-upgrade state: implementation correct, all sunset state zeroed"
	)
	.setAction(async (_args, hre: HardhatRuntimeEnvironment) => {
		const network = hre.network.name;
		const dep = readDeployment(network);

		const proxyAdmin = await hre.ethers.getContractAt(
			PROXY_ADMIN_ABI,
			dep.eth_proxy_admin
		);
		const liveImpl: string = await proxyAdmin.getProxyImplementation(
			dep.eth_maticX_proxy
		);
		const expectedImpl = dep.eth_maticX_sunset_impl;
		if (!expectedImpl) {
			throw new Error(
				"eth_maticX_sunset_impl missing from deployment-info — " +
					"cannot verify upgrade target. Run sunset:deploy-impl first."
			);
		}
		console.log("Live impl:    ", liveImpl);
		console.log("Expected impl:", expectedImpl);
		if (liveImpl.toLowerCase() !== expectedImpl.toLowerCase()) {
			throw new Error(
				"Live implementation does not match expected impl."
			);
		}

		const maticX = await hre.ethers.getContractAt(
			"MaticX",
			dep.eth_maticX_proxy
		);
		const [
			paused,
			terminalRateLocked,
			instantRedeemEnabled,
			terminalRate,
			sweepToCustodyTimestamp,
			recallInitiated,
			preFinalizeRate,
			recallComplete,
			assetCustodied,
		] = await Promise.all([
			maticX.paused(),
			maticX.terminalRateLocked(),
			maticX.instantRedeemEnabled(),
			maticX.terminalRate(),
			maticX.sweepToCustodyTimestamp(),
			maticX.recallInitiated(),
			maticX.preFinalizeRate(),
			maticX.recallComplete(),
			maticX.assetCustodied(),
		]);

		console.log("paused                    ", paused);
		console.log("terminalRateLocked        ", terminalRateLocked);
		console.log("instantRedeemEnabled      ", instantRedeemEnabled);
		console.log("terminalRate              ", terminalRate.toString());
		console.log(
			"sweepToCustodyTimestamp    ",
			sweepToCustodyTimestamp.toString()
		);
		console.log("recallInitiated           ", recallInitiated);
		console.log("preFinalizeRate           ", preFinalizeRate.toString());
		console.log("recallComplete            ", recallComplete);
		console.log("assetCustodied            ", assetCustodied);

		const fresh =
			!terminalRateLocked &&
			!instantRedeemEnabled &&
			terminalRate === 0n &&
			sweepToCustodyTimestamp === 0n &&
			!recallInitiated &&
			preFinalizeRate === 0n &&
			!recallComplete &&
			!assetCustodied;
		if (!fresh) {
			throw new Error(
				"Post-upgrade sunset state is not fresh. Aborting."
			);
		}
		console.log("\nSunset upgrade verified — state is fresh.");
	});

task("sunset:status")
	.setDescription("Reads all sunset state from the proxy")
	.setAction(async (_args, hre: HardhatRuntimeEnvironment) => {
		const dep = readDeployment(hre.network.name);
		const maticX = await hre.ethers.getContractAt(
			"MaticX",
			dep.eth_maticX_proxy
		);
		const pol = await hre.ethers.getContractAt(
			"IERC20",
			"0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"
		);
		const matic = await hre.ethers.getContractAt(
			"IERC20",
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		);

		const [
			paused,
			terminalRateLocked,
			instantRedeemEnabled,
			terminalRate,
			sweepToCustodyTimestamp,
			recallInitiated,
			preFinalizeRate,
			recallComplete,
			assetCustodied,
			totalSupply,
			polBalance,
			maticBalance,
		] = await Promise.all([
			maticX.paused(),
			maticX.terminalRateLocked(),
			maticX.instantRedeemEnabled(),
			maticX.terminalRate(),
			maticX.sweepToCustodyTimestamp(),
			maticX.recallInitiated(),
			maticX.preFinalizeRate(),
			maticX.recallComplete(),
			maticX.assetCustodied(),
			maticX.totalSupply(),
			pol.balanceOf(dep.eth_maticX_proxy),
			matic.balanceOf(dep.eth_maticX_proxy),
		]);

		console.log("MaticX proxy:", dep.eth_maticX_proxy);
		console.log("  paused                    :", paused);
		console.log("  terminalRateLocked        :", terminalRateLocked);
		console.log("  instantRedeemEnabled      :", instantRedeemEnabled);
		console.log("  terminalRate              :", terminalRate.toString());
		console.log(
			"  sweepToCustodyTimestamp    :",
			sweepToCustodyTimestamp.toString()
		);
		console.log("  recallInitiated           :", recallInitiated);
		console.log(
			"  preFinalizeRate           :",
			preFinalizeRate.toString()
		);
		console.log("  recallComplete            :", recallComplete);
		console.log("  assetCustodied            :", assetCustodied);
		console.log("  totalSupply (MATICx)      :", totalSupply.toString());
		console.log("  POL balance               :", polBalance.toString());
		console.log("  MATIC balance             :", maticBalance.toString());
	});

const STEP_ENCODERS: Record<
	string,
	(
		hre: HardhatRuntimeEnvironment,
		dep: DeploymentInfo,
		arg?: string
	) => Promise<string>
> = {
	pause: async () => encodeMaticX("togglePause", []),
	"bulk-unstake": async () => encodeMaticX("bulkUnstakeAllValidators", []),
	"claim-recall": async () => encodeMaticX("claimAssetRecallNonces", []),
	freeze: async () => encodeMaticX("finalizeTerminalRate", []),
	"push-l2": async () => encodeMaticX("pushTerminalRateToL2", []),
	"enable-instant-redeem": async () =>
		encodeMaticX("setInstantRedeemEnabled", [true]),
	"disable-instant-redeem": async () =>
		encodeMaticX("setInstantRedeemEnabled", [false]),
	"set-custody-delay": async () =>
		encodeMaticX("setCustodyDelay", [CUSTODY_DELAY_SECONDS]),
	sweep: async (hre, _dep, arg) => {
		// `--arg "<asset>,<custody>"` — comma-separated addresses since
		// the framework only supports a single string.
		const parts = (arg ?? "").split(",").map((p) => p.trim());
		if (
			parts.length !== 2 ||
			!hre.ethers.isAddress(parts[0]) ||
			!hre.ethers.isAddress(parts[1])
		) {
			throw new Error(
				'sweep step requires --arg "<assetAddress>,<custodyAddress>"'
			);
		}
		return encodeMaticX("sweepToCustody", [parts[0], parts[1]]);
	},
};

function encodeMaticX(fn: string, args: unknown[]): string {
	const iface = new Interface([
		"function togglePause() external",
		"function bulkUnstakeAllValidators() external",
		"function claimAssetRecallNonces() external",
		"function finalizeTerminalRate() external",
		"function pushTerminalRateToL2() external",
		"function setInstantRedeemEnabled(bool _enabled) external",
		"function setCustodyDelay(uint256 _custodyDelay) external",
		"function sweepToCustody(address _asset, address _custody) external",
	]);
	return iface.encodeFunctionData(fn, args);
}

task("sunset:encode-step")
	.setDescription(
		"Emits MaticX calldata for one sunset admin step (for multisig submission)"
	)
	.addParam<string>(
		"step",
		`One of: ${Object.keys(STEP_ENCODERS).join(" | ")}`,
		undefined,
		types.string
	)
	.addOptionalParam<string>(
		"arg",
		"Step-specific arg (e.g. custody address for sweep)",
		undefined,
		types.string
	)
	.setAction(
		async (
			{ step, arg }: { step: string; arg?: string },
			hre: HardhatRuntimeEnvironment
		) => {
			const encoder = STEP_ENCODERS[step];
			if (!encoder) {
				throw new Error(
					`Unknown step "${step}". Valid: ${Object.keys(STEP_ENCODERS).join(", ")}`
				);
			}
			const dep = readDeployment(hre.network.name);
			const data = await encoder(hre, dep, arg);
			console.log("Target (MaticX proxy):", dep.eth_maticX_proxy);
			console.log(`Step: ${step}`);
			console.log("Calldata:");
			console.log(" ", data);
		}
	);
