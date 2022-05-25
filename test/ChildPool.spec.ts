import chai from "chai";
import {  Transaction } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import {
    ChildPool,
    FxRootMock,
    FxStateChildTunnel,
    FxStateRootTunnel,
    MaticX,
    PolygonMock,
    RateProvider, StakeManagerMock, ValidatorRegistry
} from "../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, BigNumberish} from "@ethersproject/bignumber";
import { solidity } from "ethereum-waffle";
chai.use(solidity);
const {expect} = chai;


describe('ChildPool', () => {

    let childPool: ChildPool
    let deployer: SignerWithAddress
    let manager: SignerWithAddress
    let instant_pool_owner: SignerWithAddress
    let treasury: SignerWithAddress
    let users: SignerWithAddress[] = []
    let maticX: MaticX
    let polygonMock: PolygonMock
    let validatorRegistry: ValidatorRegistry
    let stakeManagerMock: StakeManagerMock
    let fxRootMock: FxRootMock
    let fxStateRootTunnel: FxStateRootTunnel
    let fxStateChildTunnel: FxStateChildTunnel
    let rateProvider: RateProvider

    // let convertMaticToMaticX: (_balance: BigNumberish) => Promise<void>

    before(()=>{
        /*convertMaticToMaticX = async (_balance) => {
            const signerMaticX = childPool.connect(signer)
            return signerMaticX.submit(amount)
        }*/
    });

    beforeEach(async () => {

        [deployer, ...users] = await ethers.getSigners()
        manager = deployer
        treasury = users[1]
        instant_pool_owner = deployer
        polygonMock = (await (
            await ethers.getContractFactory('PolygonMock')
        ).deploy()) as PolygonMock
        await polygonMock.deployed()

        fxRootMock = (await (
            await ethers.getContractFactory('FxRootMock')
        ).deploy()) as FxRootMock
        await fxRootMock.deployed()

        fxStateChildTunnel = (await (
            await ethers.getContractFactory('FxStateChildTunnel')
        ).deploy(fxRootMock.address)) as FxStateChildTunnel
        await fxStateChildTunnel.deployed()

        fxStateRootTunnel = (await (
            await ethers.getContractFactory('FxStateRootTunnel')
        ).deploy(manager.address, fxRootMock.address, manager.address)) as FxStateRootTunnel
        await fxStateRootTunnel.deployed()

        rateProvider = (await (
            await ethers.getContractFactory('RateProvider')
        ).deploy(fxStateChildTunnel.address)) as RateProvider
        await rateProvider.deployed()

        stakeManagerMock = (await (
            await ethers.getContractFactory('StakeManagerMock')
        ).deploy(polygonMock.address, polygonMock.address)) as StakeManagerMock
        await stakeManagerMock.deployed()

        validatorRegistry = (await upgrades.deployProxy(
            await ethers.getContractFactory('ValidatorRegistry'),
            [
                stakeManagerMock.address,
                polygonMock.address,
                ethers.constants.AddressZero,
                manager.address,
            ],
        )) as ValidatorRegistry
        await validatorRegistry.deployed()

        maticX = (await upgrades.deployProxy(
            await ethers.getContractFactory('MaticX'),
            [
                validatorRegistry.address,
                stakeManagerMock.address,
                polygonMock.address,
                manager.address,
                instant_pool_owner.address,
                treasury.address
            ],
        )) as MaticX
        await maticX.deployed()

        await validatorRegistry.setMaticX(maticX.address)
        await stakeManagerMock.createValidator(1)
        await validatorRegistry.addValidator(1)
        await validatorRegistry.setPreferredDepositValidatorId(1)
        await validatorRegistry.setPreferredWithdrawalValidatorId(1)
        await stakeManagerMock.createValidator(2)
        await validatorRegistry.addValidator(2)
        await maticX.setFxStateRootTunnel(fxStateRootTunnel.address);
        await fxStateRootTunnel.setMaticX(maticX.address);
        await fxStateRootTunnel.setFxChildTunnel(fxStateChildTunnel.address);
        await fxStateChildTunnel.setFxRootTunnel(fxStateRootTunnel.address);

        childPool = (await upgrades.deployProxy(
            await ethers.getContractFactory('ChildPool'),
            [
                fxStateChildTunnel.address,
                maticX.address,
                manager.address,
                instant_pool_owner.address,
                treasury.address,
                10
            ],
        )) as ChildPool
        await childPool.deployed()
    });

    it('get contract addresses', async () => {
        const result = await childPool.getContracts();
        expect(result).to.include(fxStateChildTunnel.address);
        expect(result).to.include(maticX.address);
        expect(result).to.include('0x0000000000000000000000000000000000000000');
    });

    it('get remaining amount after instant withdrawal fee deduction', async () => {
        const result = await childPool.getAmountAfterInstantWithdrawalFees(1000);
        expect(result).to.eql([BigNumber.from('999'), BigNumber.from('1')]);
    });

    /** TODO: mock the getreserves() **/
   /* it('gives the amount of maticX if converted from matic', async () => {
        const result = await childPool.convertMaticToMaticX(1000);
        console.log('result : ',result);
        const t1 = BigNumber.from('999');
        const t2 = BigNumber.from('1');
        expect(result).to.equal([t1, t2]);
    });*/


    /**TODO: to pass amount in msg.value **/
    /*it('get maticX from matic via instant pool', async () => {
        const result = await childPool.convertMaticToMaticX(1000);
        console.log('result : ',result);
        expect(result).to.equal([990, 10]);
    });*/
})