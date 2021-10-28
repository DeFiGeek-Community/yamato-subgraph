import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts";
import {
  Deposited,
  Borrowed,
  Withdrawn,
  Repaid,
  Redeemed,
  RedeemedMeta,
  Swept,
} from "../generated/yamato/yamato";
import { Transfer, cjpy } from "../generated/Cjpy/cjpy";
import { Pledge, WorldState, Event } from "../generated/schema";
import { yamato } from "../generated/yamato/yamato";
import { LastGoodPriceUpdated } from "../generated/priceFeed/priceFeed";
import { CJPY_ADDRESS } from "./utils/constant";

export function handleDeposit(event: Deposited): void {
  const deposit = new Event(event.transaction.hash.toHex());
  let worldState = WorldState.load(CJPY_ADDRESS);
  if (!worldState) {
    worldState = new WorldState(CJPY_ADDRESS);
    worldState.MCR = BigInt.fromI32(110);
    worldState.RRR = BigInt.fromI32(80);
    worldState.SRR = BigInt.fromI32(20);
    worldState.GRR = BigInt.fromI32(1);
    worldState.totalDebt = BigInt.fromI32(0);
    worldState.totalColl = BigInt.fromI32(0);
  }
  deposit.ethAmount = event.params.ethAmount;
  deposit.address = event.transaction.from;
  deposit.date = event.block.timestamp;
  deposit.category = "Deposit";
  deposit.save();
  worldState.totalColl = worldState.totalColl.plus(event.params.ethAmount);
  worldState.save();
  let pledge = Pledge.load(event.transaction.from.toHex());
  if (pledge === null) {
    pledge = new Pledge(event.transaction.from.toHex());
    pledge.borrowedCjpyAmount = BigInt.fromI32(0);
    pledge.ethAmount = BigInt.fromI32(0);
    pledge.withdrawLocks = BigInt.fromI32(0);
  }
  pledge.ethAmount = pledge.ethAmount.plus(event.params.ethAmount);
  pledge.save();
}

export function handleBorrow(event: Borrowed): void {
  const borrow = new Event(event.transaction.hash.toHex());
  const worldState = WorldState.load(CJPY_ADDRESS);
  borrow.date = event.block.timestamp;
  borrow.fee = event.params.fee;
  borrow.cjpyAmount = event.params.cjpyAmount;
  borrow.address = event.transaction.from;
  borrow.category = "Borrow";
  borrow.save();
  worldState.totalDebt = event.params.cjpyAmount.plus(worldState.totalDebt);
  worldState.save();
  let pledge = Pledge.load(event.transaction.from.toHex());
  pledge.borrowedCjpyAmount = event.params.cjpyAmount.plus(
    pledge.borrowedCjpyAmount || BigInt.fromI32(0)
  );
  pledge.withdrawLocks = event.block.timestamp.plus(
    BigInt.fromI32(60 * 60 * 24 * 3)
  );
  pledge.save();
}

export function handleWithdraw(event: Withdrawn): void {
  const withdraw = new Event(event.transaction.hash.toHex());
  const worldState = WorldState.load(CJPY_ADDRESS);
  withdraw.date = event.block.timestamp;
  withdraw.ethAmount = event.params.ethAmount;
  withdraw.address = event.transaction.from;
  withdraw.category = "Withdraw";
  withdraw.save();
  worldState.totalColl = worldState.totalColl.minus(event.params.ethAmount);
  worldState.save();
  let pledge = Pledge.load(event.transaction.from.toHex());
  pledge.ethAmount = pledge.ethAmount.minus(event.params.ethAmount);
  pledge.save();
}

export function handleRepay(event: Repaid): void {
  const repay = new Event(event.transaction.hash.toHex());
  const worldState = WorldState.load(CJPY_ADDRESS);
  repay.date = event.block.timestamp;
  repay.cjpyAmount = event.params.cjpyAmount;
  repay.address = event.transaction.from;
  repay.category = "Repay";
  repay.save();
  worldState.totalDebt = worldState.totalDebt.minus(event.params.cjpyAmount);
  worldState.save();
  let pledge = Pledge.load(event.transaction.from.toHex());
  pledge.borrowedCjpyAmount = pledge.borrowedCjpyAmount.minus(
    event.params.cjpyAmount
  );
  pledge.save();
}

export function handleRedeem(event: Redeemed): void {
  let redeem = Event.load(event.transaction.hash.toHexString());
  const worldState = WorldState.load(CJPY_ADDRESS);
  if (redeem === null) {
    redeem = new Event(event.transaction.hash.toHexString());
  }
  redeem.date = event.block.timestamp;
  redeem.cjpyAmount = event.params.cjpyAmount;
  redeem.ethAmount = event.params.ethAmount;
  redeem.address = event.transaction.from;
  redeem.category = "Redeem";
  worldState.totalDebt = worldState.totalDebt.minus(event.params.cjpyAmount);
  worldState.totalColl = worldState.totalColl.minus(event.params.ethAmount);
  worldState.save();
  const pledgesOwner = event.params.pledgesOwner;
  pledgesOwner.forEach((ownerAddress) => {
    let pledge = Pledge.load(ownerAddress.toString());
    const yamatoContract = yamato.bind(event.address);
    const pledgeInfo = yamatoContract.getPledge(event.transaction.from);
    pledge.borrowedCjpyAmount = pledgeInfo.debt;
    pledge.ethAmount = pledgeInfo.coll;
    pledge.save();
  });
  redeem.save();
}

export function handleRedeemMeta(event: RedeemedMeta): void {
  let redeem = Event.load(event.transaction.hash.toHex());
  if (redeem === null) {
    redeem = new Event(event.transaction.hash.toHex());
  }
  redeem.price = event.params.price;
  redeem.isCoreRedemption = event.params.isCoreRedemption;
  redeem.gasCompensationAmount = event.params.gasCompensationAmount;
  redeem.address = event.transaction.from;
  redeem.category = "Redeem";
  redeem.save();
}

export function handleSweep(event: Swept): void {
  const sweep = new Event(event.transaction.hash.toHex());
  const worldState = WorldState.load(CJPY_ADDRESS);
  sweep.date = event.block.timestamp;
  sweep.cjpyAmount = event.params.cjpyAmount;
  sweep.address = event.transaction.from;
  sweep.gasCompensationAmount = event.params.gasCompensationAmount;
  sweep.category = "Sweep";
  worldState.totalDebt = worldState.totalDebt.minus(event.params.cjpyAmount);
  worldState.save();
  const pledgesOwner = event.params.pledgesOwner;
  pledgesOwner.forEach((ownerAddress) => {
    let pledge = Pledge.load(ownerAddress.toHex());
    const yamatoContract = yamato.bind(event.address);
    const pledgeInfo = yamatoContract.getPledge(event.transaction.from);
    pledge.borrowedCjpyAmount = pledgeInfo.debt;
    pledge.ethAmount = pledgeInfo.coll;
    pledge.save();
  });
  sweep.save();
}

export function handleMintAndBurn(event: Transfer): void {
  let worldState = WorldState.load(event.address.toHexString());
  const cjpyContract = cjpy.bind(event.address);
  if (!worldState) {
    worldState = new WorldState(event.address.toHex());
  }
  worldState.totalSupplyCjpy = cjpyContract.totalSupply();
  worldState.save();
}

export function handleFetchPrice(event: LastGoodPriceUpdated): void {
  let worldState = WorldState.load(CJPY_ADDRESS);
  if (!worldState) {
    worldState = new WorldState(CJPY_ADDRESS);
    worldState.totalDebt = BigInt.fromI32(0);
    worldState.totalColl = BigInt.fromI32(0);
    worldState.MCR = BigInt.fromI32(110);
    worldState.RRR = BigInt.fromI32(80);
    worldState.SRR = BigInt.fromI32(20);
    worldState.GRR = BigInt.fromI32(1);
  }
  worldState.lastPrice = event.params._lastGoodPrice;
  if (worldState.lastPrice) {
    const old_price = BigDecimal.fromString(worldState.lastPrice.toString());
    const new_price = BigDecimal.fromString(
      event.params._lastGoodPrice.toString()
    );
    worldState.priceChange = new_price
      .minus(old_price)
      .div(old_price)
      .times(BigDecimal.fromString("100"));
  }
  worldState.save();
}
