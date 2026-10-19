IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'productos')
BEGIN
  CREATE TABLE productos (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    codigo      NVARCHAR(10),
    nombre      NVARCHAR(200) NOT NULL,
    tipo        NVARCHAR(50) NOT NULL,
    precio      DECIMAL(10,2) NOT NULL,
    descripcion NVARCHAR(MAX) DEFAULT '',
    imagen      NVARCHAR(MAX) DEFAULT '',
    colores     NVARCHAR(MAX) DEFAULT '[]',  -- JSON: [{"nombre":"Negro","hex":"#111"}]
    tallas      NVARCHAR(MAX) DEFAULT '[]',  -- JSON: [35,36,37]
    tag         NVARCHAR(50) NULL,
    stock       NVARCHAR(MAX) NULL,           -- JSON: {"37":5,"38":0}; NULL = sin control de stock
    CONSTRAINT CK_productos_colores CHECK (ISJSON(colores) = 1),
    CONSTRAINT CK_productos_tallas  CHECK (ISJSON(tallas) = 1)
  );
END;

-- Migración para bases de datos ya existentes: la columna imagen se creó
-- originalmente como NVARCHAR(300), muy pequeña para guardar imágenes en
-- base64 subidas desde el panel admin. Se amplía a NVARCHAR(MAX) si hace falta.
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('productos') AND name = 'imagen' AND max_length <> -1
)
BEGIN
  ALTER TABLE productos ALTER COLUMN imagen NVARCHAR(MAX) NULL;
END;

-- Stock por talla (JSON). NULL = sin control de stock (siempre disponible).
IF COL_LENGTH('productos', 'stock') IS NULL
BEGIN
  ALTER TABLE productos ADD stock NVARCHAR(MAX) NULL;
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

-- Estado del pedido: 'pendiente' (por defecto) o 'recibido'.
IF COL_LENGTH('pedidos', 'estado') IS NULL
BEGIN
  ALTER TABLE pedidos ADD estado NVARCHAR(20) NOT NULL CONSTRAINT DF_pedidos_estado DEFAULT 'pendiente';
END;
