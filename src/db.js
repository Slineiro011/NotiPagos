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

// Neon cierra las conexiones inactivas (por ejemplo al suspenderse). Sin este
// manejador, pg emite un "error" no capturado y tumba todo el servidor; con el,
// el pool descarta esa conexion y abre otra en la siguiente consulta.
pool.on("error", (err) => {
  console.error("Conexion inactiva de Postgres cerrada:", err.message);
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
      creado_por TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE pagos ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Sin empresa';
    ALTER TABLE pagos ADD COLUMN IF NOT EXISTS creado_por TEXT;

    CREATE TABLE IF NOT EXISTS historial_pagos (
      id SERIAL PRIMARY KEY,
      pago_id INTEGER,
      empresa TEXT NOT NULL DEFAULT 'Sin empresa',
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      monto NUMERIC NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      creado_por TEXT,
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE historial_pagos ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Sin empresa';
    ALTER TABLE historial_pagos ADD COLUMN IF NOT EXISTS creado_por TEXT;

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
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS usuario TEXT;

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'usuario',
      telefono TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'usuario';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_telefono_idx ON usuarios (telefono) WHERE telefono IS NOT NULL;

    -- Correo: antes no existia, asi que las cuentas viejas lo tienen en NULL
    -- hasta que lo agreguen en Configuracion. Sin el no se puede usar "Olvide
    -- mi contraseña" (src/routes/auth.js).
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_idx ON usuarios (correo) WHERE correo IS NOT NULL;

    -- Tokens de un solo uso para restablecer la contraseña por correo (Resend).
    CREATE TABLE IF NOT EXISTS restablecimientos_password (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expira_en TIMESTAMPTZ NOT NULL,
      usado BOOLEAN NOT NULL DEFAULT false,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Cuentas: cada una es una empresa/persona independiente, duena de sus
    -- propios usuarios, pagos e historial. Antes del registro propio, todo el
    -- sistema era de una sola empresa compartida; la migracion de abajo mete
    -- todos los datos viejos en una cuenta por defecto para no romper nada.
    CREATE TABLE IF NOT EXISTS cuentas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL DEFAULT 'Mi empresa',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      prueba_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      suscripcion_activa BOOLEAN NOT NULL DEFAULT false,
      suscripcion_vence TIMESTAMPTZ,
      plataforma_pago TEXT,
      id_compra TEXT
    );
    -- La cuenta migrada es la empresa real que ya usaba el sistema antes de
    -- que existiera el concepto de cuentas: queda con suscripcion activa de
    -- una vez para que este cambio nunca la bloquee, sin depender de que la
    -- parte de cobro (fase 2, compra en la tienda) ya este lista.
    INSERT INTO cuentas (nombre, suscripcion_activa)
      SELECT 'Empresa principal', true WHERE NOT EXISTS (SELECT 1 FROM cuentas);

    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cuenta_id INTEGER;
    UPDATE usuarios SET cuenta_id = (SELECT id FROM cuentas ORDER BY id LIMIT 1) WHERE cuenta_id IS NULL;
    ALTER TABLE usuarios ALTER COLUMN cuenta_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS usuarios_cuenta_idx ON usuarios (cuenta_id);

    ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER;
    UPDATE pagos SET cuenta_id = (SELECT id FROM cuentas ORDER BY id LIMIT 1) WHERE cuenta_id IS NULL;
    ALTER TABLE pagos ALTER COLUMN cuenta_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS pagos_cuenta_idx ON pagos (cuenta_id);

    ALTER TABLE historial_pagos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER;
    UPDATE historial_pagos SET cuenta_id = (SELECT id FROM cuentas ORDER BY id LIMIT 1) WHERE cuenta_id IS NULL;
    ALTER TABLE historial_pagos ALTER COLUMN cuenta_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS historial_pagos_cuenta_idx ON historial_pagos (cuenta_id);

    ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS cuenta_id INTEGER;
    UPDATE configuracion SET cuenta_id = (SELECT id FROM cuentas ORDER BY id LIMIT 1) WHERE cuenta_id IS NULL;
    ALTER TABLE configuracion ALTER COLUMN cuenta_id SET NOT NULL;
    ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_pkey;
    ALTER TABLE configuracion ADD CONSTRAINT configuracion_pkey PRIMARY KEY (cuenta_id, clave);

    -- Una misma compra de la tienda solo puede desbloquear una cuenta.
    CREATE UNIQUE INDEX IF NOT EXISTS cuentas_id_compra_idx ON cuentas (id_compra) WHERE id_compra IS NOT NULL;

    -- Tareas: recordatorios sin monto (ej. "todos los jueves", "vence el 3 de
    -- marzo"), separados de los pagos. Usan notificacion normal, no la alarma
    -- en bucle de los pagos.
    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      cuenta_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      recurrencia TEXT NOT NULL DEFAULT 'ninguna',
      dias_aviso INTEGER NOT NULL DEFAULT 1,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT DEFAULT '',
      creado_por TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tareas_cuenta_idx ON tareas (cuenta_id);

    CREATE TABLE IF NOT EXISTS avisos_tareas_enviados (
      id SERIAL PRIMARY KEY,
      tarea_id INTEGER NOT NULL,
      fecha DATE NOT NULL,
      UNIQUE(tarea_id, fecha)
    );
  `);
}

module.exports = { pool, migrar };
