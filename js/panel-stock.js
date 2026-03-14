// panel-stock.js
// Depende de: supabaseClient.js, utils.js

const usuarioLocal = obtenerUsuario();
const rol   = usuarioLocal["ID ROL"] || usuarioLocal.id_rol || 4;
const miDNI = usuarioLocal.DNI;
verificarRol([1, 2, 4], rol);

let stockData             = [];
let carrito               = []; // [{ codigo, nombre, estado }]
let solicitudesPendientes = []; // codigos con solicitud pendiente del usuario

const LIMITE_CARRITO = 10;

// Callbacks para mostrarTab
const tabCallbacks = {
    missolicitudes: cargarMisSolicitudes,
};

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────
async function iniciar() {
    await cargarSolicitudesPendientes();
    await cargarStock();
}

// ─── SOLICITUDES PENDIENTES DEL USUARIO ──────────────────────────────────
async function cargarSolicitudesPendientes() {
    const { data } = await supabaseClient
        .from("solicitudes")
        .select("herramienta_id")
        .eq("trabajador_dni", miDNI)
        .eq("estado", "pendiente");

    solicitudesPendientes = data ? data.map(s => s.herramienta_id) : [];
}

// ─── CARGAR STOCK ─────────────────────────────────────────────────────────
async function cargarStock() {
    const { data, error } = await supabaseClient
        .from("herramientas")
        .select("*")
        .eq("ubicacion", "almacen")
        .in("estado", ["operativa", "mantenimiento"])
        .order("nombre");

    if (error) { console.error(error); return; }

    stockData = data;
    renderizarStock(data);
}

function renderizarStock(lista) {
    const tbody = document.getElementById("tablaStock");

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="cargando">No hay herramientas disponibles en almacén.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(h => {
        const enCarrito      = carrito.some(c => c.codigo === h.codigo);
        const esOperativa    = h.estado === "operativa";
        const tieneSolicitud = solicitudesPendientes.includes(h.codigo);

        let btnHTML;
        if (!esOperativa) {
            btnHTML = `<button class="btn-agregar-carrito" disabled>No disponible</button>`;
        } else if (tieneSolicitud) {
            btnHTML = `<button class="btn-ya-solicitada" disabled>📋 En solicitud</button>`;
        } else if (enCarrito) {
            btnHTML = `<button class="btn-quitar-carrito" onclick="quitarDelCarrito(${h.codigo})">✕ Quitar</button>`;
        } else {
            btnHTML = `<button class="btn-agregar-carrito" onclick="agregarAlCarrito(${h.codigo}, '${h.nombre}', '${h.estado}')">+ Agregar</button>`;
        }

        return `
        <tr id="fila-${h.codigo}">
            <td>${h.codigo    || "—"}</td>
            <td>${h.nombre    || "—"}</td>
            <td>${h.categoria || "—"}</td>
            <td>${h.modelo    || "—"}</td>
            <td>${badgeEstado(h.estado)}</td>
            <td>${btnHTML}</td>
        </tr>`;
    }).join("");
}

function filtrarStock() {
    const texto = document.getElementById("buscadorStock").value.toLowerCase();
    const filtrados = stockData.filter(h =>
        (h.nombre || "").toLowerCase().includes(texto) ||
        String(h.codigo || "").includes(texto)
    );
    renderizarStock(filtrados);
}

// ─── CARRITO ──────────────────────────────────────────────────────────────
function agregarAlCarrito(codigo, nombre, estado) {
    if (carrito.length >= LIMITE_CARRITO) {
        // Mostrar aviso sin abrir modal
        mostrarAvisoLimite();
        return;
    }
    if (carrito.some(c => c.codigo === codigo)) return;

    carrito.push({ codigo, nombre, estado });
    actualizarBadgeCarrito();
    refrescarFilaStock(codigo);
}

function quitarDelCarrito(codigo) {
    carrito = carrito.filter(c => c.codigo !== codigo);
    actualizarBadgeCarrito();
    refrescarFilaStock(codigo);
    renderizarListaCarrito(); // si el modal está abierto lo actualiza
}

function refrescarFilaStock(codigo) {
    // Actualiza solo el botón de esa fila sin re-renderizar toda la tabla
    const h         = stockData.find(h => h.codigo === codigo);
    const fila      = document.getElementById(`fila-${codigo}`);
    if (!h || !fila) return;

    const enCarrito   = carrito.some(c => c.codigo === codigo);
    const esOperativa = h.estado === "operativa";
    const tdAccion    = fila.querySelector("td:last-child");

    const tieneSolicitud = solicitudesPendientes.includes(codigo);

    if (!esOperativa) {
        tdAccion.innerHTML = `<button class="btn-agregar-carrito" disabled>No disponible</button>`;
    } else if (tieneSolicitud) {
        tdAccion.innerHTML = `<button class="btn-ya-solicitada" disabled>📋 En solicitud</button>`;
    } else if (enCarrito) {
        tdAccion.innerHTML = `<button class="btn-quitar-carrito" onclick="quitarDelCarrito(${h.codigo})">✕ Quitar</button>`;
    } else {
        tdAccion.innerHTML = `<button class="btn-agregar-carrito" onclick="agregarAlCarrito(${h.codigo}, '${h.nombre}', '${h.estado}')">+ Agregar</button>`;
    }
}

function actualizarBadgeCarrito() {
    const badge = document.getElementById("badgeCarrito");
    const count = carrito.length;
    badge.textContent = count;
    count > 0 ? badge.classList.remove("oculto") : badge.classList.add("oculto");
}

function mostrarAvisoLimite() {
    const btn = document.querySelector(".btn-solicitar-carrito");
    btn.classList.add("shake");
    setTimeout(() => btn.classList.remove("shake"), 500);
}

// ─── MODAL CARRITO ────────────────────────────────────────────────────────
function abrirModalCarrito() {
    document.getElementById("mensajeCarrito").textContent = "";
    renderizarListaCarrito();
    abrirModal("modalCarrito");
}

function renderizarListaCarrito() {
    const listaEl    = document.getElementById("carritoLista");
    const vacioEl    = document.getElementById("carritoVacio");
    const countEl    = document.getElementById("carritoCount");
    const limiteEl   = document.getElementById("carritoLimiteMsg");
    const btnConfirm = document.getElementById("btnConfirmarCarrito");

    countEl.textContent = carrito.length;

    if (!carrito.length) {
        vacioEl.classList.remove("oculto");
        listaEl.classList.add("oculto");
        limiteEl.classList.add("oculto");
        btnConfirm.disabled = true;
        return;
    }

    vacioEl.classList.add("oculto");
    listaEl.classList.remove("oculto");
    btnConfirm.disabled = false;

    carrito.length >= LIMITE_CARRITO
        ? limiteEl.classList.remove("oculto")
        : limiteEl.classList.add("oculto");

    listaEl.innerHTML = carrito.map(item => `
        <div class="carrito-item">
            <div class="carrito-item-info">
                <span class="carrito-item-nombre">${item.nombre}</span>
                <span class="carrito-item-codigo">Código: ${item.codigo}</span>
            </div>
            <button class="carrito-item-quitar" onclick="quitarDelCarrito(${item.codigo})" title="Quitar">✕</button>
        </div>
    `).join("");
}

// ─── CONFIRMAR SOLICITUD (múltiple) ───────────────────────────────────────
async function confirmarCarrito() {
    if (!carrito.length) return;

    const mensaje  = document.getElementById("mensajeCarrito");
    const btnConf  = document.getElementById("btnConfirmarCarrito");

    btnConf.disabled    = true;
    mensaje.style.color = "gray";
    mensaje.textContent = "Verificando disponibilidad...";

    // Verificar que ninguna herramienta ya tenga solicitud pendiente del mismo usuario
    const codigos = carrito.map(c => c.codigo);

    const { data: existentes } = await supabaseClient
        .from("solicitudes")
        .select("herramienta_id")
        .eq("trabajador_dni", miDNI)
        .eq("estado", "pendiente")
        .in("herramienta_id", codigos);

    if (existentes && existentes.length) {
        const duplicados = existentes.map(e => {
            const h = carrito.find(c => c.codigo === e.herramienta_id);
            return h ? h.nombre : e.herramienta_id;
        });
        mensaje.style.color = "orange";
        mensaje.textContent = `Ya tenés solicitud pendiente para: ${duplicados.join(", ")}. Quitálas del carrito.`;
        btnConf.disabled = false;
        return;
    }

    mensaje.textContent = "Enviando solicitudes...";

    // Insertar todas las solicitudes de una vez
    const solicitudes = carrito.map(item => ({
        herramienta_id: item.codigo,
        trabajador_dni: miDNI,
        estado:         "pendiente",
    }));

    const { error } = await supabaseClient
        .from("solicitudes")
        .insert(solicitudes);

    if (error) {
        mensaje.style.color = "red";
        mensaje.textContent = "Error: " + error.message;
        btnConf.disabled = false;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = `✓ ${carrito.length} solicitud${carrito.length > 1 ? "es enviadas" : " enviada"}. El almacenero las procesará en breve.`;

    // Limpiar carrito y actualizar solicitudes pendientes
    carrito = [];
    actualizarBadgeCarrito();
    await cargarSolicitudesPendientes();

    setTimeout(() => {
        cerrarModal("modalCarrito");
        cargarStock();
    }, 1800);
}

// ─── MIS SOLICITUDES ──────────────────────────────────────────────────────
async function cargarMisSolicitudes() {
    const { data, error } = await supabaseClient
        .from("solicitudes")
        .select(`*, herramientas!solicitudes_herramienta_id_fkey(nombre, codigo)`)
        .eq("trabajador_dni", miDNI)
        .order("fecha_solicitud", { ascending: false });

    if (error) { console.error(error); return; }

    const tbody = document.getElementById("tablaMisSolicitudes");

    if (!data || !data.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="cargando">No tenés solicitudes realizadas.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(s => {
        const herramienta = s.herramientas
            ? `${s.herramientas.codigo} - ${s.herramientas.nombre}`
            : `ID: ${s.herramienta_id}`;
        const accion = s.estado === "pendiente"
            ? `<button class="btn-cancelar-sol" onclick="cancelarSolicitud(${s.id})">✕ Cancelar</button>`
            : "—";

        return `
        <tr>
            <td>${herramienta}</td>
            <td>${s.fecha_solicitud ? formatearFecha(s.fecha_solicitud) : "—"}</td>
            <td><span class="badge badge-${s.estado}">${s.estado}</span></td>
            <td>${accion}</td>
        </tr>`;
    }).join("");
}

async function cancelarSolicitud(id) {
    confirmarAccion("¿Cancelás esta solicitud?", async () => {
        const { error } = await supabaseClient
            .from("solicitudes")
            .update({ estado: "rechazada" })
            .eq("id", id)
            .eq("trabajador_dni", miDNI);

        if (error) { alert("Error: " + error.message); return; }
        await cargarSolicitudesPendientes();
        cargarStock();
        cargarMisSolicitudes();
    });
}

// ─── INICIO ───────────────────────────────────────────────────────────────
verificarCuentaActiva(usuarioLocal);
iniciar();