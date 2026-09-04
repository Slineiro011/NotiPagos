// Uso: node scripts/eliminar-usuario.js <usuario>
require("dotenv").config();
const { pool } = require("../src/db");

async function main() {
  const [usuario] = process.argv.slice(2);
  if (!usuario) {
    console.error("Uso: node scripts/eliminar-usuario.js <usuario>");
    process.exit(1);
  }
  const { rowCount } = await pool.query("DELETE FROM usuarios WHERE usuario = $1", [usuario]);
  console.log(rowCount ? `Usuario "${usuario}" eliminado.` : `No existia el usuario "${usuario}".`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
