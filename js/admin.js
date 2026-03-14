// admin.js
// Depende de: supabaseClient.js, utils.js, JSZip (CDN)

const usuarioLocal = obtenerUsuario();
if (usuarioLocal["ID ROL"] !== 1 && usuarioLocal["ID ROL"] !== "1") {
    window.location.href = "dashboard.html";
}

// ROLES viene de constants.js

let trabajadoresData  = [];
let dniSeleccionado   = "";
let historialData     = [];
let solicitudesData   = [];

// Callbacks para mostrarTab (definido en utils.js)
const tabCallbacks = {
    historial:          cargarHistorial,
    "historial-estados": cargarHistorialEstados,
};

// ─── CARGAR TRABAJADORES ───────────────────────────────────────────────────
async function cargarTrabajadores() {
    const { data, error } = await supabaseClient
        .from("trabajadores")
        .select("*")
        .order("NOMBRE");

    if (error) { console.error("Error cargando trabajadores:", error); return; }

    trabajadoresData = data;
    renderizarTrabajadores(data);
}

function renderizarTrabajadores(lista) {
    const tbody = document.getElementById("tablaTrabajadores");

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="cargando">No hay trabajadores registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(t => {
        const esActivo = t.ESTADO === true || t.ESTADO === "true";
        const rol      = t["ID ROL"] || 4;

        return `
        <tr>
            <td>${t.DNI       || "—"}</td>
            <td>${t.NOMBRE    || "—"}</td>
            <td>${t.APELLIDOS || "—"}</td>
            <td>${t.CARGO     || "—"}</td>
            <td><span class="badge badge-rol">${ROLES[rol] || "—"}</span></td>
            <td><span class="badge ${esActivo ? "badge-activo" : "badge-inactivo"}">${esActivo ? "Activo" : "Inactivo"}</span></td>
            <td>
                <div class="acciones">
                    <button class="btn-accion btn-reset"  onclick="abrirModalReset('${t.DNI}', '${t.NOMBRE} ${t.APELLIDOS}')">🔑 Reset</button>
                    <button class="btn-accion btn-rol"    onclick="abrirModalRol('${t.DNI}', '${t.NOMBRE} ${t.APELLIDOS}', ${rol})">👤 Rol</button>
                    <button class="btn-accion btn-estado" onclick="toggleEstado('${t.DNI}', ${esActivo})">${esActivo ? "⛔ Desactivar" : "✅ Activar"}</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

// ─── BUSCADOR ─────────────────────────────────────────────────────────────
function filtrarTrabajadores() {
    const texto = document.getElementById("buscadorTrabajador").value.toLowerCase();
    const filtrados = trabajadoresData.filter(t =>
        (t.NOMBRE    || "").toLowerCase().includes(texto) ||
        (t.APELLIDOS || "").toLowerCase().includes(texto) ||
        (t.DNI       || "").toLowerCase().includes(texto)
    );
    renderizarTrabajadores(filtrados);
}

// ─── RESETEAR CONTRASEÑA ──────────────────────────────────────────────────
function abrirModalReset(dni, nombre) {
    dniSeleccionado = dni;
    document.getElementById("modalNombre").textContent = nombre;
    document.getElementById("modalDNI").textContent    = dni;
    document.getElementById("resultadoReset").classList.add("oculto");
    document.getElementById("btnResetear").style.display = "block";
    document.getElementById("tempPassBox").textContent   = "—";
    abrirModal("modalReset");
}

async function resetearPassword() {
    const btn = document.getElementById("btnResetear");
    btn.textContent = "Reseteando...";
    btn.disabled    = true;

    try {
        const { data: result, error } = await supabaseClient.functions.invoke("smooth-service", {
            body: { dni: dniSeleccionado }
        });

        if (error || result?.error) {
            alert("Error: " + (result?.error || error?.message || "Error desconocido"));
            return;
        }

        document.getElementById("tempPassBox").textContent = result.temp_pass;
        document.getElementById("resultadoReset").classList.remove("oculto");
        btn.style.display = "none";

    } catch (err) {
        alert("Error de conexión: " + err.message);
    } finally {
        btn.textContent = "Resetear";
        btn.disabled    = false;
    }
}

// ─── CAMBIAR ROL ──────────────────────────────────────────────────────────
function abrirModalRol(dni, nombre, rolActual) {
    dniSeleccionado = dni;
    document.getElementById("modalRolNombre").textContent = nombre;
    document.getElementById("selectRol").value            = rolActual;
    abrirModal("modalRol");
}

async function confirmarCambioRol() {
    const nuevoRol = parseInt(document.getElementById("selectRol").value);

    const { error } = await supabaseClient
        .from("trabajadores")
        .update({ "ID ROL": nuevoRol })
        .eq("DNI", dniSeleccionado);

    if (error) { alert("Error cambiando rol: " + error.message); return; }

    cerrarModal("modalRol");
    cargarTrabajadores();
}

// ─── ACTIVAR / DESACTIVAR ─────────────────────────────────────────────────
async function toggleEstado(dni, esActivo) {
    confirmarAccion(`¿Querés ${esActivo ? "desactivar" : "activar"} este trabajador?`, async () => {
        const { error } = await supabaseClient
            .from("trabajadores")
            .update({ ESTADO: !esActivo })
            .eq("DNI", dni);

        if (error) { alert("Error: " + error.message); return; }
        cargarTrabajadores();
    });
}

// ─── AGREGAR TRABAJADOR ───────────────────────────────────────────────────
function mostrarModalAgregar() {
    document.getElementById("nuevoDNI").value             = "";
    document.getElementById("nuevoNombre").value          = "";
    document.getElementById("nuevoApellidos").value       = "";
    document.getElementById("nuevoCargo").value           = "";
    document.getElementById("nuevoRol").value             = "4";
    document.getElementById("mensajeAgregar").textContent = "";
    abrirModal("modalAgregar");
}

async function agregarTrabajador() {
    const dni       = document.getElementById("nuevoDNI").value.trim();
    const nombre    = document.getElementById("nuevoNombre").value.trim();
    const apellidos = document.getElementById("nuevoApellidos").value.trim();
    const cargo     = document.getElementById("nuevoCargo").value.trim();
    const rol       = parseInt(document.getElementById("nuevoRol").value);
    const mensaje   = document.getElementById("mensajeAgregar");

    if (!dni || !nombre || !apellidos || !cargo) {
        mensaje.style.color = "red";
        mensaje.textContent = "Completá todos los campos.";
        return;
    }

    mensaje.style.color = "gray";
    mensaje.textContent = "Creando trabajador...";

    const { error: insertError } = await supabaseClient
        .from("trabajadores")
        .insert({
            DNI:       dni,
            NOMBRE:    nombre,
            APELLIDOS: apellidos,
            CARGO:     cargo,
            "ID ROL":  rol,
            ESTADO:    true,
            EMAIL:     `${dni}@kardex.local`,
            temp_pass: null,
        });

    if (insertError) {
        mensaje.style.color = "red";
        if (insertError.code === "23505") {
            mensaje.textContent = "Error: ya existe un trabajador con ese DNI.";
        } else {
            mensaje.textContent = "Error al guardar: " + insertError.message;
        }
        return;
    }

    mensaje.textContent = "Generando contraseña temporal...";

    try {
        const { data: result, error } = await supabaseClient.functions.invoke("smooth-service", {
            body: { dni }
        });

        if (error || result?.error) {
            mensaje.style.color = "orange";
            mensaje.textContent = `⚠ Trabajador guardado pero sin acceso Auth. Error: ${result?.error || error?.message || "desconocido"}. Usá "Resetear contraseña" desde la tabla.`;
            setTimeout(() => { cerrarModal("modalAgregar"); cargarTrabajadores(); }, 3000);
            return;
        }

        mensaje.style.color = "green";
        mensaje.textContent = `✓ Trabajador creado. Contraseña temporal: ${result.temp_pass}`;
        setTimeout(() => { cerrarModal("modalAgregar"); cargarTrabajadores(); }, 2500);

    } catch (err) {
        mensaje.style.color = "orange";
        mensaje.textContent = "⚠ Trabajador guardado. No se pudo generar contraseña. Usá 'Resetear contraseña' desde la tabla.";
        console.error("Error llamando reset-password:", err);
        setTimeout(() => { cerrarModal("modalAgregar"); cargarTrabajadores(); }, 3000);
    }
}

// ─── HISTORIAL COMPLETO ────────────────────────────────────────────────────
async function cargarHistorial() {
    const contenedor = document.getElementById("tablaHistorial");
    if (!contenedor) return;

    contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">Cargando historial...</p>`;

    const { data: movs, error: errMovs } = await supabaseClient
        .from("movimientos")
        .select(`*, herramientas!fk_mov_herramienta(nombre, codigo, categoria, modelo, estado)`)
        .order("fecha", { ascending: false })
        .limit(500);

    if (errMovs) {
        contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center;color:red">Error: ${errMovs.message}</p>`;
        return;
    }

    const { data: sols, error: errSols } = await supabaseClient
        .from("solicitudes")
        .select(`
            *,
            herramientas!solicitudes_herramienta_id_fkey(nombre, codigo, categoria, modelo, estado),
            trabajadores!solicitudes_trabajador_dni_fkey(NOMBRE, APELLIDOS, CARGO)
        `)
        .in("estado", ["cancelada", "rechazada", "no_disponible"])
        .order("fecha_solicitud", { ascending: false })
        .limit(300);

    if (errSols) console.warn("No se pudieron cargar solicitudes:", errSols.message);

    historialData   = movs  || [];
    solicitudesData = sols  || [];

    const dnisMovs  = historialData.flatMap(m => [m.dni_origen, m.dni_destino].filter(Boolean));
    const dnisSols  = solicitudesData.map(s => s.trabajador_dni).filter(Boolean);
    const todosDnis = [...new Set([...dnisMovs, ...dnisSols])];

    let personas = {};
    if (todosDnis.length) {
        const { data: workers } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .in("DNI", todosDnis);
        if (workers) workers.forEach(w => { personas[w.DNI] = w; });
    }

    const gruposMovs = {};
    historialData.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const key    = `mov__${m.dni_origen || "alm"}__${m.dni_destino || m.destino_tipo}__${minuto}`;
        if (!gruposMovs[key]) {
            gruposMovs[key] = {
                tipo: "movimiento", dniOrigen: m.dni_origen, dniDestino: m.dni_destino,
                destinoTipo: m.destino_tipo, fecha: m.fecha, fechaConf: m.fecha_confirmacion,
                observacion: m.observacion, estado: m.estado, items: []
            };
        }
        gruposMovs[key].items.push({
            codigo: m.herramientas?.codigo || "—", nombre: m.herramientas?.nombre || "—",
            categoria: m.herramientas?.categoria || "—", modelo: m.herramientas?.modelo || "—",
            estadoH: m.herramientas?.estado || "—",
        });
    });

    const gruposSols = {};
    solicitudesData.forEach(s => {
        const minuto = s.fecha_solicitud ? s.fecha_solicitud.slice(0, 16) : "sin-fecha";
        const key    = `sol__${s.trabajador_dni}__${minuto}`;
        if (!gruposSols[key]) {
            gruposSols[key] = {
                tipo: "solicitud", dniOrigen: s.trabajador_dni, dniDestino: null,
                destinoTipo: "almacen", fecha: s.fecha_solicitud, fechaConf: s.fecha_respuesta || null,
                observacion: null, estado: s.estado, items: []
            };
        }
        gruposSols[key].items.push({
            codigo: s.herramientas?.codigo || "—", nombre: s.herramientas?.nombre || "—",
            categoria: s.herramientas?.categoria || "—", modelo: s.herramientas?.modelo || "—",
            estadoH: s.herramientas?.estado || "—",
        });
    });

    const items = [...Object.values(gruposMovs), ...Object.values(gruposSols)];
    items.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

    if (!items.length) {
        contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">No hay registros.</p>`;
        return;
    }

    contenedor.innerHTML = "";

    items.forEach((g, idx) => {
        const origen  = g.dniOrigen  ? personas[g.dniOrigen]  : null;
        const destino = g.dniDestino ? personas[g.dniDestino] : null;

        const nombreOrigen     = origen ? `${origen.NOMBRE} ${origen.APELLIDOS}` : (g.dniOrigen ? g.dniOrigen : "🏭 Almacén");
        const esDestinoAlmacen = g.destinoTipo === "almacen" || !g.dniDestino;
        const nombreDestino    = esDestinoAlmacen
            ? "🏭 Almacén"
            : (destino ? `${destino.NOMBRE} ${destino.APELLIDOS}` : g.dniDestino || "—");

        const badgeAlmacen = esDestinoAlmacen
            ? `<span class="badge badge-almacen" style="font-size:0.7rem;padding:2px 8px;flex-shrink:0">🏭 Almacén</span>`
            : "";

        let tagEstado;
        if (g.tipo === "solicitud") {
            tagEstado = g.estado === "no_disponible"
                ? `<span class="hist-tag hist-tag-rechazado">📭 Sin stock</span>`
                : `<span class="hist-tag hist-tag-rechazado">❌ Solicitud rechazada</span>`;
        } else {
            if (g.estado === "rechazado") {
                tagEstado = `<span class="hist-tag hist-tag-rechazado">❌ Rechazado</span>`;
            } else if (g.estado === "confirmado") {
                tagEstado = esDestinoAlmacen
                    ? `<span class="hist-tag hist-tag-recibido">📥 Devuelto</span>`
                    : `<span class="hist-tag hist-tag-enviado">📤 Entregado</span>`;
            } else {
                tagEstado = `<span class="hist-tag hist-tag-pendiente">⏳ Pendiente</span>`;
            }
        }

        const total      = g.items.length;
        const gestorDNI  = (g.tipo === "movimiento" && (g.estado === "rechazado" || g.estado === "confirmado")) ? g.dniDestino : null;
        const gestorData = gestorDNI ? personas[gestorDNI] : null;
        const gestorNom  = gestorData ? `${gestorData.NOMBRE} ${gestorData.APELLIDOS}` : (gestorDNI || "—");
        const gestionLabel = g.estado === "rechazado" ? "Rechazado por" : "Aceptado por";
        const gestionColor = g.estado === "rechazado" ? "color:#e53e3e" : "color:#2e7d32";
        const gestionHTML  = gestorDNI ? `
            <div class="hist-persona-dato" style="${gestionColor}">
                <span class="hist-dato-label">${gestionLabel}</span>
                <span>${gestorNom} — DNI: ${gestorDNI}</span>
            </div>` : "";

        const tipoLabel = g.tipo === "solicitud"
            ? `<div class="hist-persona-dato"><span class="hist-dato-label">Tipo</span><span><span class="badge badge-mantenimiento" style="font-size:0.72rem">📋 Solicitud de stock</span></span></div>`
            : "";

        const bloque = document.createElement("div");
        bloque.className = "hist-bloque";
        bloque.id = `adm-hist-bloque-${idx}`;
        bloque.innerHTML = `
            <div class="hist-bloque-header" onclick="toggleAdmHistBloque(${idx})">
                <div class="hist-bloque-left">
                    ${tagEstado}
                    ${badgeAlmacen}
                    <div class="hist-bloque-personas">
                        <span class="hist-persona-origen">${nombreOrigen}</span>
                        <span class="hist-flecha">→</span>
                        <span class="hist-persona-destino">${nombreDestino}</span>
                    </div>
                </div>
                <div class="hist-bloque-right">
                    <span class="hist-bloque-count">${total} herramienta${total !== 1 ? "s" : ""}</span>
                    <span class="hist-bloque-fecha">${g.fecha ? formatearFecha(g.fecha) : "—"}</span>
                    <span class="hist-chevron" id="adm-hist-chevron-${idx}">▼</span>
                </div>
            </div>
            <div class="hist-bloque-detalle oculto" id="adm-hist-detalle-${idx}">
                <div class="hist-personas-grid">
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📤 Origen</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniOrigen || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreOrigen}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${origen?.CARGO || "—"}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📥 Destino</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Tipo</span><span>${esDestinoAlmacen ? "🏭 Almacén" : "👤 Trabajador"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreDestino}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${destino?.CARGO || (esDestinoAlmacen ? "Almacenero" : "—")}</span></div>
                        ${gestionHTML}
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📅 Fechas y Obs.</div>
                        ${tipoLabel}
                        <div class="hist-persona-dato"><span class="hist-dato-label">Emisión</span><span>${g.fecha ? formatearFecha(g.fecha) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Confirmación</span><span>${g.fechaConf ? formatearFecha(g.fechaConf) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Observación</span><span>${g.observacion || "—"}</span></div>
                    </div>
                </div>
                <div class="hist-herr-titulo">🔧 Herramientas</div>
                <div class="tabla-wrapper">
                    <table class="tabla tabla-sm">
                        <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Modelo</th><th>Estado</th></tr></thead>
                        <tbody>
                            ${g.items.map(item => `
                            <tr>
                                <td>${item.codigo}</td><td>${item.nombre}</td>
                                <td>${item.categoria}</td><td>${item.modelo}</td>
                                <td>${badgeEstado(item.estadoH)}</td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>`;
        contenedor.appendChild(bloque);
    });
}

function toggleAdmHistBloque(idx) {
    const detalle = document.getElementById(`adm-hist-detalle-${idx}`);
    const chevron = document.getElementById(`adm-hist-chevron-${idx}`);
    const bloque  = document.getElementById(`adm-hist-bloque-${idx}`);
    if (!detalle || !chevron || !bloque) return;

    const abierto = !detalle.classList.contains("oculto");
    if (abierto) {
        detalle.classList.add("oculto");
        chevron.textContent = "▼";
        bloque.classList.remove("hist-bloque-abierto");
    } else {
        detalle.classList.remove("oculto");
        chevron.textContent = "▲";
        bloque.classList.add("hist-bloque-abierto");
    }
}

function exportarHistorialAdmin() {
    if (!historialData.length && !solicitudesData.length) {
        alert("No hay datos para exportar. Abrí el tab Historial primero.");
        return;
    }

    const filas = [["Tipo", "Código", "Herramienta", "DNI Origen", "DNI Destino", "Tipo Destino", "Estado", "Observación", "Fecha Emisión", "Fecha Confirmación"]];

    historialData.forEach(m => filas.push([
        "Movimiento",
        m.herramientas?.codigo || m.herramienta_id || "",
        m.herramientas?.nombre || "",
        m.dni_origen  || "", m.dni_destino || "",
        m.destino_tipo === "almacen" ? "Almacén" : "Trabajador",
        m.estado || "", m.observacion || "",
        m.fecha              ? formatearFecha(m.fecha)              : "",
        m.fecha_confirmacion ? formatearFecha(m.fecha_confirmacion) : "",
    ]));

    solicitudesData.forEach(s => filas.push([
        "Solicitud rechazada",
        s.herramientas?.codigo || s.herramienta_id || "",
        s.herramientas?.nombre || "",
        s.trabajador_dni || "", "", "Almacén", s.estado || "", "",
        s.fecha_solicitud ? formatearFecha(s.fecha_solicitud) : "",
        s.fecha_respuesta ? formatearFecha(s.fecha_respuesta) : "",
    ]));

    exportarCSV(filas, "historial_completo_admin");
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORIAL DE ESTADOS
// ═══════════════════════════════════════════════════════════════════════════

let historialEstadosData = [];

async function cargarHistorialEstados() {
    const contenedor = document.getElementById("tablaHistorialEstados");
    if (!contenedor) return;

    contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">Cargando...</p>`;

    const { data, error } = await supabaseClient
        .from("historial_estados")
        .select(`
            *,
            herramientas!historial_estados_herramienta_id_fkey(nombre, codigo),
            trabajadores!historial_estados_trabajador_dni_fkey(NOMBRE, APELLIDOS, CARGO)
        `)
        .order("fecha", { ascending: false })
        .limit(500);

    if (error) {
        contenedor.innerHTML = `<p class="cargando" style="color:red;padding:30px;text-align:center">Error: ${error.message}</p>`;
        return;
    }

    historialEstadosData = data || [];

    if (!historialEstadosData.length) {
        contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">No hay registros de cambios de estado.</p>`;
        return;
    }

    contenedor.innerHTML = `
    <table class="tabla">
        <thead>
            <tr>
                <th>Herramienta</th>
                <th>Estado anterior</th>
                <th>Estado nuevo</th>
                <th>Justificación</th>
                <th>Realizado por</th>
                <th>Fecha</th>
            </tr>
        </thead>
        <tbody>
            ${historialEstadosData.map(r => `
            <tr>
                <td>${r.herramientas ? r.herramientas.nombre + " (" + r.herramientas.codigo + ")" : r.herramienta_id}</td>
                <td>${badgeEstado(r.estado_anterior)}</td>
                <td>${badgeEstado(r.estado_nuevo)}</td>
                <td style="max-width:220px;white-space:normal;font-size:0.82rem">${r.descripcion || "—"}</td>
                <td>${r.trabajadores ? r.trabajadores.NOMBRE + " " + r.trabajadores.APELLIDOS : r.trabajador_dni}</td>
                <td>${r.fecha ? formatearFecha(r.fecha) : "—"}</td>
            </tr>`).join("")}
        </tbody>
    </table>`;
}

function exportarHistorialEstados() {
    if (!historialEstadosData.length) {
        alert("No hay datos para exportar. Abrí el tab primero.");
        return;
    }

    const filas = [["Herramienta", "Código", "Estado Anterior", "Estado Nuevo", "Justificación", "DNI Responsable", "Responsable", "Fecha"]];
    historialEstadosData.forEach(r => filas.push([
        r.herramientas?.nombre  || "",
        r.herramientas?.codigo  || r.herramienta_id || "",
        r.estado_anterior       || "",
        r.estado_nuevo          || "",
        r.descripcion           || "",
        r.trabajador_dni        || "",
        r.trabajadores ? r.trabajadores.NOMBRE + " " + r.trabajadores.APELLIDOS : "",
        r.fecha ? formatearFecha(r.fecha) : "",
    ]));

    exportarCSV(filas, "historial_estados_herramientas");
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP MANUAL
// ═══════════════════════════════════════════════════════════════════════════

// Nombres de meses en español
const MESES = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

// Estado temporal del backup en curso
let _backupMeta = null;

// ─── PASO 1: Validar formulario y abrir modal de confirmación ─────────────
function abrirConfirmacionBackup() {
    const tipo    = document.getElementById("backupTipo").value;
    const semana  = document.getElementById("backupSemana").value;
    const version = document.getElementById("backupVersion").value.trim();

    // Limpiar mensaje previo
    const msgEl = document.getElementById("backupMensaje");
    msgEl.className   = "backup-mensaje oculto";
    msgEl.textContent = "";

    // Validaciones
    if (!tipo) {
        mostrarMensajeBackup("Seleccioná el tipo de backup.", "error");
        return;
    }
    if (!semana) {
        mostrarMensajeBackup("Seleccioná la semana de guardia.", "error");
        return;
    }
    if (!version) {
        mostrarMensajeBackup("Ingresá la versión del sistema.", "error");
        return;
    }

    // Armar metadatos
    const ahora    = new Date();
    const mes      = MESES[ahora.getMonth()];
    const anio     = ahora.getFullYear();
    const hh       = String(ahora.getHours()).padStart(2, "0");
    const mm       = String(ahora.getMinutes()).padStart(2, "0");
    const horaStr  = `${hh}${mm}`;
    const tipoLabel = tipo === "cierre" ? "CIERRE de guardia" : "INICIO de guardia";
    const tipoSlug  = tipo === "cierre" ? "cierre" : "inicio";
    const nombreArchivo = `backup_${tipoSlug}_semana${semana}_${mes}_${anio}_${horaStr}.zip`;

    _backupMeta = { tipo, tipoLabel, semana, version, mes, anio, horaStr, nombreArchivo, ahora };

    // Llenar modal de confirmación
    document.getElementById("confirmTipo").textContent    = tipoLabel;
    document.getElementById("confirmSemana").textContent  = `Semana ${semana}`;
    document.getElementById("confirmMes").textContent     = `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${anio}`;
    document.getElementById("confirmVersion").textContent = `v${version}`;
    document.getElementById("confirmArchivo").textContent = nombreArchivo;

    // Resetear barra de progreso
    document.getElementById("backupProgreso").classList.add("oculto");
    setProgreso(0, "");
    document.getElementById("btnConfirmarBackup").disabled = false;
    document.getElementById("btnCancelarBackup").disabled  = false;

    abrirModal("modalBackup");
}

// ─── PASO 2: Ejecutar backup ──────────────────────────────────────────────
async function ejecutarBackup() {
    if (!_backupMeta) return;

    const btnConfirmar = document.getElementById("btnConfirmarBackup");
    const btnCancelar  = document.getElementById("btnCancelarBackup");
    const progreso     = document.getElementById("backupProgreso");

    btnConfirmar.disabled = true;
    btnCancelar.disabled  = true;
    progreso.classList.remove("oculto");

    try {
        // ── Llamar a la Edge Function backup-service ──
        setProgreso(10, "Conectando con el servidor...");

        const resp = await fetch(
            "https://lcqpetvtgulehmqdoshb.supabase.co/functions/v1/backup-service",
            {
                method:  "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey":        SUPABASE_KEY,
                    "Authorization": "Bearer " + SUPABASE_KEY,
                },
                body: JSON.stringify({ solicitante_dni: usuarioLocal.DNI }),
            }
        );
        const resultado = await resp.json();
        if (!resp.ok || resultado?.error) {
            throw new Error(resultado?.error || "Error " + resp.status + " en la Edge Function");
        }

        setProgreso(50, "Datos recibidos. Armando archivos...");

        // ── Armar ZIP con JSZip ──
        const zip = new JSZip();

        // CSV: trabajadores
        setProgreso(60, "Generando trabajadores.csv...");
        zip.file("trabajadores.csv", generarCSV(resultado.trabajadores, [
            "DNI","NOMBRE","APELLIDOS","CARGO","ID ROL","ESTADO","EMAIL"
        ]));

        // CSV: herramientas
        setProgreso(68, "Generando herramientas.csv...");
        zip.file("herramientas.csv", generarCSV(resultado.herramientas, [
            "codigo","nombre","categoria","modelo","estado","ubicacion","trabajador_dni"
        ]));

        // CSV: movimientos
        setProgreso(76, "Generando movimientos.csv...");
        zip.file("movimientos.csv", generarCSV(
            resultado.movimientos.map(r => ({
                ...r,
                fecha:              r.fecha              ? formatearFecha(r.fecha)              : "",
                fecha_confirmacion: r.fecha_confirmacion ? formatearFecha(r.fecha_confirmacion) : "",
            })),
            ["id_mov","herramienta_id","dni_origen","dni_destino","destino_tipo",
             "observacion","confirmado_origen","confirmado_destino","estado","fecha","fecha_confirmacion"]
        ));

        // CSV: solicitudes
        setProgreso(82, "Generando solicitudes.csv...");
        zip.file("solicitudes.csv", generarCSV(
            resultado.solicitudes.map(r => ({
                ...r,
                fecha_solicitud: r.fecha_solicitud ? formatearFecha(r.fecha_solicitud) : "",
                fecha_respuesta: r.fecha_respuesta ? formatearFecha(r.fecha_respuesta) : "",
            })),
            ["id","herramienta_id","trabajador_dni","estado","fecha_solicitud","fecha_respuesta"]
        ));

        // CSV: historial_estados
        setProgreso(88, "Generando historial_estados.csv...");
        zip.file("historial_estados.csv", generarCSV(
            resultado.historialEstados.map(r => ({
                ...r,
                fecha: r.fecha ? formatearFecha(r.fecha) : "",
            })),
            ["id","herramienta_id","estado_anterior","estado_nuevo","descripcion","trabajador_dni","fecha"]
        ));

        // TXT: resumen
        setProgreso(90, "Generando resumen.txt...");
        zip.file("resumen.txt", generarResumenTxt(resultado, _backupMeta));

        // ── Descargar ZIP ──
        setProgreso(96, "Comprimiendo y descargando...");
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = _backupMeta.nombreArchivo;
        a.click();
        URL.revokeObjectURL(url);

        setProgreso(100, "✅ Backup completado.");

        // Mostrar mensaje de éxito en el formulario también
        mostrarMensajeBackup(`✅ Backup generado: ${_backupMeta.nombreArchivo}`, "exito");

        // Cerrar modal luego de un momento
        setTimeout(() => {
            cerrarModal("modalBackup");
            btnConfirmar.disabled = false;
            btnCancelar.disabled  = false;
        }, 1800);

    } catch (err) {
        console.error("Error en backup:", err);
        setProgreso(0, "");
        progreso.classList.add("oculto");
        btnConfirmar.disabled = false;
        btnCancelar.disabled  = false;
        mostrarMensajeBackup(`❌ Error al generar el backup: ${err.message}`, "error");
        cerrarModal("modalBackup");
    }
}

// ─── Helpers de UI ────────────────────────────────────────────────────────
function setProgreso(porcentaje, texto) {
    const fill  = document.getElementById("backupProgresoFill");
    const label = document.getElementById("backupProgresoTexto");
    if (fill)  fill.style.width   = `${porcentaje}%`;
    if (label) label.textContent  = texto;
}

function mostrarMensajeBackup(texto, tipo) {
    const el = document.getElementById("backupMensaje");
    el.textContent = texto;
    el.className   = `backup-mensaje ${tipo}`;
}

// ─── Generar CSV desde array de objetos ───────────────────────────────────
function generarCSV(filas, columnas) {
    if (!filas || !filas.length) return "sep=,\n" + columnas.join(",") + "\n";

    const escapar = v => {
        const s = v === null || v === undefined ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
    };

    const header  = columnas.join(",");
    const cuerpo  = filas.map(f => columnas.map(c => escapar(f[c])).join(",")).join("\n");
    // sep=, indica a Excel el separador sin importar configuración regional
    return "sep=,\n" + header + "\n" + cuerpo;
}

// ─── Generar resumen.txt ──────────────────────────────────────────────────
function generarResumenTxt(data, meta) {
    const ahora   = meta.ahora;
    const dd      = String(ahora.getDate()).padStart(2, "0");
    const mm      = String(ahora.getMonth() + 1).padStart(2, "0");
    const yyyy    = ahora.getFullYear();
    const hh      = String(ahora.getHours()).padStart(2, "0");
    const min     = String(ahora.getMinutes()).padStart(2, "0");
    const fechaStr = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    const mesNom   = meta.mes.charAt(0).toUpperCase() + meta.mes.slice(1);

    const trabajadores     = data.trabajadores     || [];
    const herramientas     = data.herramientas     || [];
    const movimientos      = data.movimientos      || [];
    const solicitudes      = data.solicitudes      || [];
    const historialEstados = data.historialEstados || [];

    // Conteos movimientos
    const movsConfirmados = movimientos.filter(m => m.estado === "confirmado").length;
    const movsRechazados  = movimientos.filter(m => m.estado === "rechazado").length;
    const movsPendientes  = movimientos.filter(m => m.estado === "pendiente").length;

    // Conteos solicitudes
    const solsAprobadas    = solicitudes.filter(s => s.estado === "aprobada").length;
    const solsCanceladas   = solicitudes.filter(s => s.estado === "cancelada").length;
    const solsRechazadas   = solicitudes.filter(s => s.estado === "rechazada").length;
    const solsNoDisponible = solicitudes.filter(s => s.estado === "no_disponible").length;
    const solsPendientes   = solicitudes.filter(s => s.estado === "pendiente").length;

    // Herramientas por estado
    const herrEnUso      = herramientas.filter(h => h.estado === "en_uso").length;
    const herrDisponible = herramientas.filter(h => h.estado === "disponible").length;
    const herrMantenimi  = herramientas.filter(h => h.estado === "mantenimiento").length;

    // Rango de fechas de movimientos
    const fechasMovs = movimientos.map(m => m.fecha).filter(Boolean).sort();
    const movMasAntiguo  = fechasMovs.length ? formatearFecha(fechasMovs[0])                   : "—";
    const movMasReciente = fechasMovs.length ? formatearFecha(fechasMovs[fechasMovs.length - 1]) : "—";

    // Rango de fechas de solicitudes
    const fechasSols = solicitudes.map(s => s.fecha_solicitud).filter(Boolean).sort();
    const solMasAntigua  = fechasSols.length ? formatearFecha(fechasSols[0])                   : "—";
    const solMasReciente = fechasSols.length ? formatearFecha(fechasSols[fechasSols.length - 1]) : "—";

    // Nombre del admin
    const adminNombre = `${usuarioLocal.NOMBRE || ""} ${usuarioLocal.APELLIDOS || ""}`.trim();

    const pad = (texto, largo = 28) => String(texto).padEnd(largo);

    return [
        "=============================================",
        "   KARDEX DIGITAL — BACKUP DEL SISTEMA",
        "=============================================",
        "",
        `${pad("Versión del sistema :")} ${meta.version}`,
        `${pad("Fecha de backup     :")} ${fechaStr}`,
        `${pad("Tipo de backup      :")} ${meta.tipoLabel}`,
        `${pad("Semana de guardia   :")} Semana ${meta.semana} — ${mesNom} ${meta.anio}`,
        `${pad("Generado por        :")} ${adminNombre} (DNI: ${usuarioLocal.DNI || "—"})`,
        "",
        "---------------------------------------------",
        "RESUMEN DE TABLAS",
        "---------------------------------------------",
        `${pad("Trabajadores        :")} ${trabajadores.length} registros`,
        "",
        `${pad("Herramientas        :")} ${herramientas.length} registros`,
        `${pad("  - En uso          :")} ${herrEnUso}`,
        `${pad("  - Disponibles     :")} ${herrDisponible}`,
        `${pad("  - Mantenimiento   :")} ${herrMantenimi}`,
        "",
        `${pad("Movimientos         :")} ${movimientos.length} registros`,
        `${pad("  - Confirmados     :")} ${movsConfirmados}`,
        `${pad("  - Rechazados      :")} ${movsRechazados}`,
        `${pad("  - Pendientes      :")} ${movsPendientes}`,
        "",
        `${pad("Solicitudes         :")} ${solicitudes.length} registros`,
        `${pad("  - Aprobadas       :")} ${solsAprobadas}`,
        `${pad("  - Canceladas      :")} ${solsCanceladas}`,
        `${pad("  - Rechazadas      :")} ${solsRechazadas}`,
        `${pad("  - Sin stock       :")} ${solsNoDisponible}`,
        `${pad("  - Pendientes      :")} ${solsPendientes}`,
        "",
        `${pad("Historial estados   :")} ${historialEstados.length} registros`,
        "",
        "---------------------------------------------",
        "RANGO DE DATOS",
        "---------------------------------------------",
        `${pad("Movimiento más antiguo  :")} ${movMasAntiguo}`,
        `${pad("Movimiento más reciente :")} ${movMasReciente}`,
        `${pad("Solicitud más antigua   :")} ${solMasAntigua}`,
        `${pad("Solicitud más reciente  :")} ${solMasReciente}`,
        "",
        "=============================================",
        "   FIN DEL RESUMEN",
        "=============================================",
    ].join("\n");
}

// ─── INICIO ───────────────────────────────────────────────────────────────
verificarCuentaActiva(usuarioLocal);
cargarTrabajadores();