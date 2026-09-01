const { Pool, types } = require("pg");

// Sin esto, pg convierte las columnas DATE a objetos Date de JS en UTC medianoche,
// lo que corre la fecha un dia hacia atras al formatear en una zona horaria negativa
// (ej. Colombia, UTC-5). Se devuelve el texto plano "AAAA-MM-DD" tal cual esta en la BD.
types.setTypeParser(types.builtins.DATE, (val) => val);

if (!process.env.DATABASE_URL) {
  console.warn("Advertencia: no se definio DATABASE_URL. Configura la cadena de conexion de Neon en el archivo .env.");
}

const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL DEFAULT 'Sin empresa',
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otro',
      monto NUMERIC NOT NULL DEFAULT 0,
      fecha_vencimiento DATE NOT NULL,
      recurrencia TEXT NOT NULL DEFAULT 'ninguna',
      dias_aviso INTEGER NOT NULL DEFAULT 3,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT DEFAULT '',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE pagos ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Sin empresa';

    CREATE TABLE IF NOT EXISTS historial_pagos (
      id SERIAL PRIMARY KEY,
      pago_id INTEGER,
      empresa TEXT NOT NULL DEFAULT 'Sin empresa',
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      monto NUMERIC NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE historial_pagos ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Sin empresa';

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS avisos_enviados (
      id SERIAL PRIMARY KEY,
      pago_id INTEGER NOT NULL,
      fecha DATE NOT NULL,
      UNIQUE(pago_id, fecha)
    );

    CREATE TABLE IF NOT EXISTS borradores_pago (
      numero TEXT PRIMARY KEY,
      datos JSONB NOT NULL DEFAULT '{}',
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS dispositivos (
      token TEXT PRIMARY KEY,
      plataforma TEXT NOT NULL DEFAULT 'android',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, migrar };
