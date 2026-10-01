import { BarChart, Book, Settings } from "lucide-react";
import { Link } from "react-router-dom";

function Ayuda() {
  return (
    <main className="pagina pagina-ayuda">
      <header className="ayuda-cabecera">
        <p className="flujo-eyebrow">Manual de usuario</p>
        <h1>Cómo usar Control Cartola</h1>
        <p>Registre sus movimientos en el Libro Banco, revise su reporte en Flujo de Caja y organice sus categorías en Ajustes.</p>
      </header>

      <section className="ayuda-seccion" aria-labelledby="ayuda-libro-banco">
        <header className="ayuda-seccion-cabecera">
          <Book size={28} aria-hidden="true" />
          <div>
            <p className="ayuda-numero">Módulo 1</p>
            <h2 id="ayuda-libro-banco">Libro Banco</h2>
          </div>
        </header>
        <p>Aquí anota el dinero que entra y sale de su cuenta cada día.</p>
        <h3>Para ingresar un movimiento</h3>
        <ol>
          <li>Busque la <strong>fila celeste</strong> debajo de los títulos de la tabla. Complete la fecha, la sucursal y la descripción.</li>
          <li>Elija una categoría y una subcategoría. Escriba el monto en <strong>Abono</strong> si recibió dinero, o en <strong>Cargo</strong> si realizó un pago.</li>
          <li>Presione <strong>Guardar</strong>. El movimiento aparecerá en la tabla y el saldo se actualizará automáticamente.</li>
        </ol>
        <div className="ayuda-nota">
          <h3>Qué significan los colores</h3>
          <ul>
            <li><strong>Verde:</strong> entró dinero a la cuenta.</li>
            <li><strong>Rojo en Cargos:</strong> salió dinero de la cuenta.</li>
            <li><strong>Rojo en Saldo:</strong> el saldo es menor que cero.</li>
          </ul>
        </div>
        <h3>Usar una planilla del banco</h3>
        <p>Presione <strong>Importar Excel</strong> y elija la cartola descargada de su banco. Los movimientos se incorporan a la tabla. Con <strong>Exportar</strong> puede descargar su cartola en Excel.</p>
        <p>Use el lápiz de una fila para corregir un movimiento. También puede buscar o elegir un período para encontrarlo más fácilmente.</p>
        <p>Deslice la barra inferior para ver las columnas de la derecha. Desplácese dentro de la tabla para recorrer los movimientos; los títulos y la fila de ingreso se mantienen visibles.</p>
        <Link className="ayuda-enlace" to="/">Ir al Libro Banco <span aria-hidden="true">→</span></Link>
      </section>

      <section className="ayuda-seccion" aria-labelledby="ayuda-flujo-caja">
        <header className="ayuda-seccion-cabecera">
          <BarChart size={28} aria-hidden="true" />
          <div>
            <p className="ayuda-numero">Módulo 2</p>
            <h2 id="ayuda-flujo-caja">Flujo de Caja</h2>
          </div>
        </header>
        <p>Este es su <strong>reporte automático</strong>. Reúne los movimientos del Libro Banco por categoría y muestra sus ingresos, gastos y saldos.</p>
        <ol>
          <li>En <strong>Agrupar por</strong>, elija <strong>Mensual</strong> para ver meses como Agosto 2026, o <strong>Anual</strong> para revisar cada año. También puede elegir <strong>Semanal</strong>.</li>
          <li>Revise los bloques <strong>INGRESOS</strong> y <strong>EGRESOS</strong>. Sus subtotales indican cuánto dinero entró y salió en cada período.</li>
          <li>Presione el nombre de una categoría para mostrar u ocultar sus subcategorías.</li>
        </ol>
        <p>El <strong>Flujo Neto</strong> es la diferencia entre ingresos y egresos. El <strong>Saldo Acumulado</strong> suma ese resultado al saldo que venía del período anterior.</p>
        <div className="ayuda-nota">
          <h3>Cómo leer la Proyección</h3>
          <p>La última columna estima el próximo período usando el promedio histórico de los períodos registrados. Por ejemplo, si un concepto tuvo $100.000 en agosto y $200.000 en septiembre, su proyección mensual será $150.000.</p>
          <p>Es una estimación para orientarse. Para cada concepto, los períodos disponibles sin actividad cuentan como $0 en el promedio.</p>
        </div>
        <Link className="ayuda-enlace" to="/flujo-caja">Ir al Flujo de Caja <span aria-hidden="true">→</span></Link>
      </section>

      <section className="ayuda-seccion" aria-labelledby="ayuda-ajustes">
        <header className="ayuda-seccion-cabecera">
          <Settings size={28} aria-hidden="true" />
          <div>
            <p className="ayuda-numero">Módulo 3</p>
            <h2 id="ayuda-ajustes">Ajustes</h2>
          </div>
        </header>
        <p>Aquí organiza las categorías y subcategorías que usa para clasificar sus movimientos.</p>
        <ol>
          <li>Para agregar un nuevo tipo de gasto, busque el grupo <strong>Egresos</strong> y presione <strong>+ Nueva Categoría</strong>. Por ejemplo, escriba <strong>Compra de Maquinaria</strong> y agréguela.</li>
          <li>Para crear un detalle dentro de una categoría, presione <strong>+ Subcategoría</strong> junto a su nombre. Escriba el nombre y presione <strong>Agregar</strong>.</li>
          <li>Al terminar, presione <strong>Guardar Cambios</strong>. Las nuevas opciones aparecerán en los selectores del Libro Banco cuando vuelva a esa vista.</li>
        </ol>
        <div className="ayuda-nota">
          <p><strong>Recuerde guardar:</strong> el aviso «Cambios pendientes» indica que todavía necesita presionar Guardar Cambios.</p>
        </div>
        <Link className="ayuda-enlace" to="/configuracion">Ir a Ajustes <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}

export default Ayuda;
