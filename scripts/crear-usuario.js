// Uso: node scripts/crear-usuario.js <usuario> <password> [nombre]
// Crea o actualiza la contraseña de un usuario que puede iniciar sesion en la app.
require("dotenv").config();
const usuariosService = require("../src/services/usuariosService");
const { pool } = require("../src/db");

async function main() {
  const [usuario, password, nombre] = process.argv.slice(2);
  if (!usuario || !password) {
    console.error("Uso: node scripts/crear-usuario.js <usuario> <password> [nombre]");
    process.exit(1);
  }
  const creado = await usuariosService.crear(usuario, nombre, password);
  console.log("Usuario listo:", creado);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
