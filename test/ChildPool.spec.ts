import { expect } from "chai";
import {  utils } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import {
    IFxStateChildTunnel,
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

    let maticApprove: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
    let maticXApprove: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
    let swapMaticForMaticXViaInstantPool: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
    let provideInstantPoolMatic: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
    let provideInstantPoolMaticX: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>

    before(()=>{

        maticApprove = async (signer, amount) => {
            const signerERC20 = polygonMock.connect(signer)
            await signerERC20.approve(maticX.address, amount)
            console.log('matic balance',await signerERC20.balanceOf(signer.address));
        }

        maticXApprove = async (signer, amount) => {
            const signerMaticX = maticX.connect(signer)
            await signerMaticX.approve(maticX.address, amount)
            console.log('maticX balance',await signerMaticX.balanceOf(signer.address));
        }

        provideInstantPoolMatic = async (signer, amount) => {
            await maticApprove(signer, amount)
            const signerChildPool = childPool.connect(signer)
            await signerChildPool.provideInstantPoolMatic({value: amount})
        }
        provideInstantPoolMaticX = async (signer, amount) => {
            await maticXApprove(signer, amount)
            const signerChildPool = childPool.connect(signer)
            await signerChildPool.provideInstantPoolMaticX(amount)
        }

        swapMaticForMaticXViaInstantPool = async (signer: SignerWithAddress, amount: BigNumberish) => {
            const signerChildPool = await childPool.connect(signer)
            const result = await signerChildPool.swapMaticForMaticXViaInstantPool({
                value: amount
            })
            console.log(result);
            //return result;
        }
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
        await childPool.setFxStateChildTunnel(fxStateChildTunnel.address);


        /*await maticApprove(instant_pool_owner, ethers.utils.parseEther("1000.0"));
        await maticXApprove(instant_pool_owner, ethers.utils.parseEther("1000.0"));
        await childPool.provideInstantPoolMatic({
            from: instant_pool_owner.address,
            value: ethers.utils.parseEther("1000.0")
        });
        await childPool.provideInstantPoolMaticX(ethers.utils.parseEther("1000.0"), {
            from: instant_pool_owner.address
        });*/
        const abiCoder = new utils.AbiCoder();
        /*await fxRootMock.sendMessageToChild(fxStateChildTunnel.address, abiCoder.encode(
            [ "uint", "string" ], [ 1234, "Hello World" ]
        ),{
            from: fxStateRootTunnel.address
        });*/

        await fxRootMock.sendMessageToChildWithAddress(fxStateChildTunnel.address, fxStateRootTunnel.address, abiCoder.encode(
            [ "uint", "uint" ], [ 1000, 1000 ]
        ));
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

    it('gives the amount of maticX if converted from matic', async () => {
        /*const setup = await ethers.getContractAt("IFxStateChildTunnel", fxStateChildTunnel.address);
        console.log(await setup.convertMaticToMaticX(
            100
        ));*/
        const result = await childPool.convertMaticToMaticX(100);
        expect(result).to.eql([BigNumber.from('100'), BigNumber.from('1000'), BigNumber.from('1000')])
    });


    it('get maticX from matic via instant pool', async () => {
        console.log(await childPool.instantPoolMaticX());
        console.log(await childPool.instantPoolMatic());
        console.log('1');
        await provideInstantPoolMatic(instant_pool_owner, ethers.utils.parseEther("100.0"))
        console.log('2');
        console.log(await childPool.instantPoolMaticX());
        console.log(await childPool.instantPoolMatic());
        await provideInstantPoolMaticX(deployer, ethers.utils.parseEther("100.0"))
        console.log('3');
        console.log(await childPool.instantPoolMaticX());
        console.log(await childPool.instantPoolMatic());
        const result = await swapMaticForMaticXViaInstantPool(users[0], ethers.utils.parseEther("2"));
        console.log('result : ',result);
    });
})