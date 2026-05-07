from pydantic import BaseModel


class BrokerCreate(BaseModel):
    name: str


class BrokerUpdate(BaseModel):
    cash: float | None = None
    cash_usd: float | None = None
    cash_hkd: float | None = None


class BrokerOut(BaseModel):
    id: int
    name: str
    position: int
    cash: float
    cash_usd: float
    cash_hkd: float


class BrokerCashCreate(BaseModel):
    broker_id: int
    currency: str = "SGD"


class BrokerCashUpdate(BaseModel):
    amount: float | None = None


class BrokerCashOut(BaseModel):
    id: int
    broker_id: int
    currency: str
    amount: float


class StockCreate(BaseModel):
    broker_id: int
    symbol: str = ""
    shares: float = 0
    cost: float = 0
    price: float = 0
    currency: str = "SGD"


class StockUpdate(BaseModel):
    symbol: str | None = None
    shares: float | None = None
    cost: float | None = None
    price: float | None = None
    currency: str | None = None


class StockOut(BaseModel):
    id: int
    broker_id: int
    symbol: str
    shares: float
    cost: float
    price: float
    currency: str


class SimpleItemCreate(BaseModel):
    name: str = ""
    value: float = 0


class SimpleItemUpdate(BaseModel):
    name: str | None = None
    value: float | None = None


class SimpleItemOut(BaseModel):
    id: int
    name: str
    value: float


class CurrencyItemCreate(BaseModel):
    name: str = ""
    value: float = 0
    currency: str = "SGD"


class CurrencyItemUpdate(BaseModel):
    name: str | None = None
    value: float | None = None
    currency: str | None = None


class CurrencyItemOut(BaseModel):
    id: int
    name: str
    value: float
    currency: str


class CPFUpdate(BaseModel):
    oa: float | None = None
    sa: float | None = None
    ma: float | None = None
    ra: float | None = None


class CPFOut(BaseModel):
    oa: float
    sa: float
    ma: float
    ra: float


class SnapshotCreate(BaseModel):
    date: str
    stocks: float = 0
    bonds: float = 0
    cash: float = 0
    cpf: float = 0
    other: float = 0
    liab: float = 0


class SnapshotOut(BaseModel):
    id: int
    date: str
    stocks: float
    bonds: float
    cash: float
    cpf: float
    other: float
    liab: float
    total: float


class PortfolioOut(BaseModel):
    brokers: list[BrokerOut]
    stocks: list[StockOut]
    broker_cash: list[BrokerCashOut]
    bonds: list[SimpleItemOut]
    cash: list[SimpleItemOut]
    other: list[CurrencyItemOut]
    other_liquid: list[CurrencyItemOut]
    insurance: list[SimpleItemOut]
    liabilities: list[SimpleItemOut]
    cpf: CPFOut


class AuthRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
