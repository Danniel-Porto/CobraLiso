function toMoney(value) {
  return Number(value).toFixed(2);
}

function applyMonthlyInterest(balance, ratePercent) {
  const numericBalance = Number(balance);
  const numericRate = Number(ratePercent);
  const interest = numericBalance * (numericRate / 100);
  const newBalance = numericBalance + interest;
  return {
    interest: Number(toMoney(interest)),
    newBalance: Number(toMoney(newBalance)),
  };
}

function simulatePayoff({ balance, ratePercent, getPaymentForMonth, maxMonths = 600 }) {
  let saldo = Number(balance);
  let totalInterest = 0;
  let month = 1;
  const schedule = [];

  while (saldo > 0 && month <= maxMonths) {
    const interest = saldo * (Number(ratePercent) / 100);
    totalInterest += interest;
    saldo += interest;

    const rawPayment = Number(getPaymentForMonth(month) || 0);
    const payment = Math.min(Math.max(rawPayment, 0), saldo);
    saldo -= payment;

    schedule.push({
      month,
      interest: Number(toMoney(interest)),
      payment: Number(toMoney(payment)),
      balance: Number(toMoney(Math.max(0, saldo))),
    });

    if (payment === 0) {
      break;
    }

    month += 1;
  }

  return {
    schedule,
    totalInterest: Number(toMoney(totalInterest)),
    remainingBalance: Number(toMoney(Math.max(0, saldo))),
    settled: saldo <= 0,
  };
}

module.exports = {
  applyMonthlyInterest,
  simulatePayoff,
  toMoney,
};
