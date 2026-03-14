// panel-busqueda.js
// Depende de: supabaseClient.js, utils.js

const usuarioLocal = obtenerUsuario();
const rol = usuarioLocal["ID ROL"] || usuarioLocal.id_rol || 4;
verificarRol([1, 2, 3], rol);

// No hay tabs con carga lazy en este panel
const tabCallbacks = {};

// ─── BUSCAR ───────────────────────────────────────────────────────────────
async function buscar() {
    const nombre    = document.getElementById("filtroNombre").value.trim().toLowerCase();
    const codigo    = document.getElementById("filtroCodigo").value.trim();
    const categoria = document.getElementById("filtroCategoria").value.trim();
    const estado    = document.getElementById("filtroEstado").value;
    const dni       = document.getElementById("filtroDNI").value.trim();
    const ubicacion = document.getElementById("filtroUbicacion").value;

    document.getElementById("estadoBusqueda").textContent = "Buscando...";
    document.getElementById("resultadosContainer").classList.add("oculto");

    let query = supabaseClient
        .from("herramientas")
        .select("*, trabajadores(NOMBRE, APELLIDOS)")
        .order("nombre");

    if (estado)    query = query.eq("estado", estado);
    if (ubicacion) query = query.eq("ubicacion", ubicacion);

    const { data, error } = await query;

    if (error) {
        document.getElementById("estadoBusqueda").textContent = "Error al buscar: " + error.message;
        return;
    }

    let filtrados = data;
    if (nombre)    filtrados = filtrados.filter(h => (h.nombre || "").toLowerCase().includes(nombre));
    if (codigo)    filtrados = filtrados.filter(h => String(h.codigo    || "").includes(codigo));
    if (categoria) filtrados = filtrados.filter(h => String(h.categoria || "").includes(categoria));
    if (dni) {
        filtrados = filtrados.filter(h => {
            const dniMatch    = (h.trabajador_dni || "").includes(dni);
            const nombreMatch = h.trabajadores
                ? `${h.trabajadores.NOMBRE} ${h.trabajadores.APELLIDOS}`.toLowerCase().includes(dni.toLowerCase())
                : false;
            return dniMatch || nombreMatch;
        });
    }

    renderizarResultados(filtrados);
}

function renderizarResultados(lista) {
    const estadoEl  = document.getElementById("estadoBusqueda");
    const container = document.getElementById("resultadosContainer");
    const tbody     = document.getElementById("tablaResultados");
    const total     = document.getElementById("totalResultados");

    if (!lista.length) {
        estadoEl.textContent = "No se encontraron herramientas con esos filtros.";
        container.classList.add("oculto");
        return;
    }

    estadoEl.textContent = "";
    container.classList.remove("oculto");
    total.textContent = `${lista.length} resultado${lista.length !== 1 ? "s" : ""}`;

    tbody.innerHTML = lista.map(h => {
        const trabajador = h.trabajadores
            ? `${h.trabajadores.NOMBRE} ${h.trabajadores.APELLIDOS}`
            : "—";

        return `
        <tr>
            <td>${h.codigo    || "—"}</td>
            <td>${h.nombre    || "—"}</td>
            <td>${h.categoria || "—"}</td>
            <td>${h.modelo    || "—"}</td>
            <td>${badgeEstado(h.estado)}</td>
            <td>${badgeUbicacion(h.ubicacion)}</td>
            <td>${trabajador}</td>
            <td><button class="btn-detalle" onclick="abrirDetalle(${h.codigo})">Ver detalle</button></td>
        </tr>`;
    }).join("");
}

function limpiarFiltros() {
    ["filtroNombre", "filtroCodigo", "filtroCategoria", "filtroDNI"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("filtroEstado").value    = "";
    document.getElementById("filtroUbicacion").value = "";
    document.getElementById("estadoBusqueda").textContent = "Ingresá los filtros y presioná Buscar.";
    document.getElementById("resultadosContainer").classList.add("oculto");
}

// ─── DETALLE DE HERRAMIENTA ───────────────────────────────────────────────
async function abrirDetalle(codigo) {
    const { data: h } = await supabaseClient
        .from("herramientas")
        .select("*, trabajadores(NOMBRE, APELLIDOS, DNI, CARGO)")
        .eq("codigo", codigo)
        .single();

    if (!h) return;

    const trabajador = h.trabajadores
        ? `${h.trabajadores.NOMBRE} ${h.trabajadores.APELLIDOS} — ${h.trabajadores.CARGO} (DNI: ${h.trabajadores.DNI})`
        : "En almacén";

    document.getElementById("detalleNombre").textContent      = h.nombre      || "—";
    document.getElementById("detalleCodigo").textContent      = h.codigo      || "Sin código";
    document.getElementById("detalleCategoria").textContent   = h.codigo      || "—";   // ← ahora muestra el código
    document.getElementById("detalleModelo").textContent      = h.modelo      || "—";
    document.getElementById("detalleDescripcion").textContent = h.descripcion || "—";
    document.getElementById("detalleTrabajador").textContent  = trabajador;
    document.getElementById("detalleEstado").innerHTML        = badgeEstado(h.estado);
    document.getElementById("detalleUbicacion").innerHTML     = badgeUbicacion(h.ubicacion);

    await cargarHistorialDetalle(h.codigo);
    abrirModal("modalDetalle");
}

async function cargarHistorialDetalle(herramientaId) {
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select("*")
        .eq("herramienta_id", herramientaId)
        .is("confirmado_origen", true)
        .is("confirmado_destino", true)
        .order("fecha", { ascending: false })
        .limit(20);

    const tbody = document.getElementById("detalleHistorial");

    if (error || !data.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="cargando">Sin movimientos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(m => `
        <tr>
            <td>${m.dni_origen  || "—"}</td>
            <td>${m.dni_destino || "—"}</td>
            <td>${badgeUbicacion(m.destino_tipo)}</td>
            <td>${m.observacion || "—"}</td>
            <td>${m.fecha ? formatearFecha(m.fecha) : "—"}</td>
        </tr>`
    ).join("");
}

// ─── EXPORTAR ─────────────────────────────────────────────────────────────
async function exportarReporteTrabajador() {
    const { data, error } = await supabaseClient
        .from("herramientas")
        .select("*, trabajadores(NOMBRE, APELLIDOS, DNI, CARGO)")
        .eq("ubicacion", "campo")
        .order("trabajador_dni");

    if (error || !data || !data.length) { alert("No hay herramientas asignadas a trabajadores."); return; }

    const filas = [["DNI Trabajador", "Nombre", "Apellidos", "Cargo", "Código Herramienta", "Herramienta", "Categoría", "Modelo", "Estado"]];
    data.forEach(h => filas.push([
        h.trabajadores ? h.trabajadores.DNI       || "" : h.trabajador_dni || "",
        h.trabajadores ? h.trabajadores.NOMBRE    || "" : "",
        h.trabajadores ? h.trabajadores.APELLIDOS || "" : "",
        h.trabajadores ? h.trabajadores.CARGO     || "" : "",
        h.codigo    || "", h.nombre    || "",
        h.categoria || "", h.modelo    || "", h.estado || ""
    ]));

    exportarCSV(filas, "reporte_herramientas_trabajadores");
}

// ─── BUSCAR CON ENTER ─────────────────────────────────────────────────────
verificarCuentaActiva(usuarioLocal);

document.querySelectorAll(".input-filtro").forEach(input => {
    input.addEventListener("keydown", e => { if (e.key === "Enter") buscar(); });
});