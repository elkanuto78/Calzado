# Calzados Paredes — Tienda Online

Backend en Node.js (sin frameworks) + frontend en HTML/CSS/JS + Azure SQL Database.

## 1. Configurar la base de datos

1. Crea la base de datos en Azure SQL (ver guía paso a paso que te compartió Claude).
2. Copia `.env.example` a `.env` y completa tus datos de conexión:
   ```
   cp .env.example .env
   ```
3. Instala dependencias:
   ```
   npm install
   ```
4. Crea las tablas y migra los datos existentes de `productos.json` / `pedidos.json`:
   ```
   node migrate.js
   ```
   Deberías ver algo como:
   ```
   ✓ Tablas verificadas/creadas
   ✓ 14 productos migrados
   ✓ 2 pedidos migrados
   ✓ Migración completa
   ```

## 2. Probar en local

```
node server.js
```

Abre http://localhost:3000

## 3. Publicar en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render → New + → Web Service → conecta el repo.
3. Start Command: `node server.js`
4. En **Environment**, agrega las variables `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (los mismos valores de tu `.env`, sin subir el archivo `.env` en sí).
5. Deploy.

## Notas

- `productos.json` y `pedidos.json` ya no se usan en producción (solo sirvieron como fuente para la migración inicial). Se guardan como respaldo histórico.
- El firewall de Azure SQL debe permitir conexiones desde "Azure services and resources" para que Render pueda conectarse.
