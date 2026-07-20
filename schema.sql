IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'productos')
BEGIN
  CREATE TABLE productos (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    codigo      NVARCHAR(10),
    nombre      NVARCHAR(200) NOT NULL,
    tipo        NVARCHAR(50) NOT NULL,
    precio      DECIMAL(10,2) NOT NULL,
    descripcion NVARCHAR(MAX) DEFAULT '',
    imagen      NVARCHAR(300) DEFAULT '',
    colores     NVARCHAR(MAX) DEFAULT '[]',  -- JSON: [{"nombre":"Negro","hex":"#111"}]
    tallas      NVARCHAR(MAX) DEFAULT '[]',  -- JSON: [35,36,37]
    tag         NVARCHAR(50) NULL,
    CONSTRAINT CK_productos_colores CHECK (ISJSON(colores) = 1),
    CONSTRAINT CK_productos_tallas  CHECK (ISJSON(tallas) = 1)
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pedidos')
BEGIN
  CREATE TABLE pedidos (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    fecha   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    cliente NVARCHAR(MAX) NOT NULL,  -- JSON: {"nombre":..,"telefono":..,...}
    items   NVARCHAR(MAX) NOT NULL, -- JSON: [{"id":1,"nombre":..,"cantidad":..},...]
    total   DECIMAL(10,2) NOT NULL,
    CONSTRAINT CK_pedidos_cliente CHECK (ISJSON(cliente) = 1),
    CONSTRAINT CK_pedidos_items   CHECK (ISJSON(items) = 1)
  );
END;
