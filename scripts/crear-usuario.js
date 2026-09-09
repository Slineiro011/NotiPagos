// Uso: node scripts/crear-usuario.js <usuario> <password> [nombre] [rol] [telefono]
// rol: "usuario" (por defecto, solo ve sus propios pagos) o "jefe" (ve los de todos).
// telefono: numero de WhatsApp (con codigo de pais, sin "+") para que esta persona
// tambien pueda usar el bot y quede identificada automaticamente.
require("dotenv").config();
const usuariosService = require("../src/services/usuariosService");
const { pool } = require("../src/db");

async function main() {
  const [usuario, password, nombre, rol, telefono] = process.argv.slice(2);
  if (!usuario || !password) {
    console.error("Uso: node scripts/crear-usuario.js <usuario> <password> [nombre] [rol] [telefono]");
    process.exit(1);
  }
  const creado = await usuariosService.crear(usuario, nombre, password, { rol, telefono });
  console.log("Usuario listo:", creado);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
