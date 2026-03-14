// panel-almacen.js
// Depende de: supabaseClient.js, utils.js

const usuarioLocal = obtenerUsuario();
const rol = usuarioLocal["ID ROL"] || usuarioLocal.id_rol || 4;
verificarRol([1, 3], rol);

let stockData               = [];
let herramientaSeleccionada = null;

// Callbacks para mostrarTab (definido en utils.js)
const tabCallbacks = {
    solicitudes:          cargarSolicitudes,
    pendientes:           cargarPendientes,
    historial:            cargarHistorial,
    "historial-estados":  cargarHistorialEstadosAlmacen,
};

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────
async function iniciar() {
    await Promise.all([cargarStock(), actualizarBadges()]);
}

// ─── BADGES ───────────────────────────────────────────────────────────────
async function actualizarBadges() {
    const { data: sol } = await supabaseClient
        .from("solicitudes")
        .select("id")
        .eq("estado", "pendiente");

    actualizarBadge("badgeSolicitudes", sol?.length || 0);

    const { data: pend } = await supabaseClient
        .from("movimientos")
        .select("id_mov")
        .is("confirmado_origen", true)
        .is("confirmado_destino", false)
        .eq("destino_tipo", "almacen");

    actualizarBadge("badgePendientes", pend?.length || 0);
}

// ─── STOCK ────────────────────────────────────────────────────────────────
// Mapa de conteo de justificaciones por herramienta { codigo: count }
let justificacionesCount = {};

async function cargarStock() {
    const { data, error } = await supabaseClient
        .from("herramientas")
        .select("*")
        .eq("ubicacion", "almacen")
        .order("nombre");

    if (error) { console.error(error); return; }

    stockData = data;

    // Cargar conteo de justificaciones para mostrar el botón
    const codigos = data.map(h => h.codigo);
    if (codigos.length) {
        const { data: justs } = await supabaseClient
            .from("historial_estados")
            .select("herramienta_id")
            .in("herramienta_id", codigos);

        justificacionesCount = {};
        if (justs) {
            justs.forEach(j => {
                justificacionesCount[j.herramienta_id] = (justificacionesCount[j.herramienta_id] || 0) + 1;
            });
        }
    }

    renderizarStock(data);
}

function renderizarStock(lista) {
    const tbody = document.getElementById("tablaStock");

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="cargando">No hay herramientas en almacén.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(h => {
        const tieneJust = justificacionesCount[h.codigo] > 0;
        const btnJust   = tieneJust
            ? `<button class="btn-accion btn-just-tabla" onclick="abrirModalJustificacion(${h.codigo}, '${h.nombre}')">📋 Ver</button>`
            : `<span style="font-size:0.78rem;color:#8a97b8">—</span>`;

        return `
        <tr>
            <td>${h.codigo    || "—"}</td>
            <td>${h.nombre    || "—"}</td>
            <td>${h.categoria || "—"}</td>
            <td>${h.modelo    || "—"}</td>
            <td>${badgeEstado(h.estado)}</td>
            <td>${btnJust}</td>
            <td>
                <div class="acciones-fila">
                    ${rol === 3 ? `<button class="btn-accion btn-salida-tabla" onclick="abrirModalSalidaDirecta(${h.codigo})">📤 Salida</button>` : ""}
                    ${rol === 3 ? `<button class="btn-accion btn-estado-tabla" onclick="abrirModalEstado(${h.codigo}, '${h.nombre}', '${h.estado}')">🔧 Estado</button>` : ""}
                    ${rol === 1 ? `<span style="font-size:0.78rem;color:#8a97b8">Solo lectura</span>` : ""}
                </div>
            </td>
        </tr>`;
    }).join("");
}

function filtrarStock() {
    const texto  = document.getElementById("buscadorStock").value.toLowerCase();
    const estado = document.getElementById("filtroEstadoStock").value;

    const filtrados = stockData.filter(h => {
        const coincideTexto  = (h.nombre || "").toLowerCase().includes(texto) ||
                               String(h.codigo || "").includes(texto);
        const coincideEstado = !estado || h.estado === estado;
        return coincideTexto && coincideEstado;
    });

    renderizarStock(filtrados);
}

// ─── REGISTRAR SALIDA DIRECTA (desde botón de cada fila) ──────────────────
function abrirModalSalidaDirecta(codigo) {
    const select = document.getElementById("salidaHerramienta");
    select.innerHTML = `<option value="${codigo}">${codigo}</option>`;
    select.value = codigo;
    document.getElementById("salidaDNI").value              = "";
    document.getElementById("salidaObservacion").value      = "";
    document.getElementById("nombreTrabajador").textContent = "—";
    document.getElementById("mensajeSalida").textContent    = "";
    abrirModal("modalSalida");
}

// Preview DNI en salida (usando utils.js)
activarPreviewDNI("salidaDNI", "nombreTrabajador");

async function registrarSalida() {
    const herramientaCodigo = document.getElementById("salidaHerramienta").value;
    const dniDestino        = document.getElementById("salidaDNI").value.trim();
    const observacion       = document.getElementById("salidaObservacion").value.trim();
    const mensaje           = document.getElementById("mensajeSalida");

    if (!herramientaCodigo || !dniDestino) {
        mensaje.style.color = "red";
        mensaje.textContent = "Completá todos los campos.";
        return;
    }

    const { data: trabajador } = await supabaseClient
        .from("trabajadores")
        .select("DNI")
        .eq("DNI", dniDestino)
        .single();

    if (!trabajador) {
        mensaje.style.color = "red";
        mensaje.textContent = "DNI no encontrado.";
        return;
    }

    mensaje.style.color = "gray";
    mensaje.textContent = "Registrando...";

    const { error } = await supabaseClient.from("movimientos").insert({
        herramienta_id:     parseInt(herramientaCodigo),
        dni_origen:         usuarioLocal.DNI,
        dni_destino:        dniDestino,
        destino_tipo:       "persona",
        observacion:        observacion || null,
        confirmado_origen:  true,
        confirmado_destino: false,
        estado:             "pendiente",
    });

    if (error) { mensaje.style.color = "red"; mensaje.textContent = "Error: " + error.message; return; }

    mensaje.style.color = "green";
    mensaje.textContent = "✓ Salida registrada. Esperando confirmación del trabajador.";
    setTimeout(() => { cerrarModal("modalSalida"); actualizarBadges(); cargarStock(); }, 1500);
}

// ─── CAMBIAR ESTADO ───────────────────────────────────────────────────────
let estadoAnterior = "";

function abrirModalEstado(codigo, nombre, estadoActual) {
    herramientaSeleccionada = codigo;
    estadoAnterior = estadoActual;
    document.getElementById("modalEstadoNombre").textContent = nombre;
    document.getElementById("selectEstado").value            = estadoActual;
    document.getElementById("estadoDescripcion").value       = "";
    document.getElementById("mensajeEstado").textContent     = "";
    abrirModal("modalEstado");
}

async function confirmarCambioEstado() {
    const nuevoEstado  = document.getElementById("selectEstado").value;
    const descripcion  = document.getElementById("estadoDescripcion").value.trim();
    const mensaje      = document.getElementById("mensajeEstado");

    // Validar descripcion obligatoria
    if (!descripcion) {
        mensaje.style.color = "red";
        mensaje.textContent = "La justificación es obligatoria.";
        return;
    }

    mensaje.style.color = "gray";
    mensaje.textContent = "Guardando...";

    // 1. Actualizar estado en herramientas
    const { error } = await supabaseClient
        .from("herramientas")
        .update({ estado: nuevoEstado })
        .eq("codigo", herramientaSeleccionada);

    if (error) { mensaje.style.color = "red"; mensaje.textContent = "Error: " + error.message; return; }

    // 2. Registrar en historial_estados
    const { error: histError } = await supabaseClient
        .from("historial_estados")
        .insert({
            herramienta_id:  herramientaSeleccionada,
            estado_anterior: estadoAnterior,
            estado_nuevo:    nuevoEstado,
            descripcion:     descripcion,
            trabajador_dni:  usuarioLocal.DNI,
        });

    if (histError) console.error("Error guardando historial estado:", histError.message);

    mensaje.style.color = "green";
    mensaje.textContent = "✓ Estado actualizado.";
    setTimeout(() => { cerrarModal("modalEstado"); cargarStock(); }, 1000);
}

// ─── SOLICITUDES ──────────────────────────────────────────────────────────
// ─── SOLICITUDES AGRUPADAS ────────────────────────────────────────────────
// Agrupa por trabajador_dni + fecha_solicitud (truncada al minuto)
// para mostrar un pedido por fila en vez de una herramienta por fila

let grupoSeleccionado = null; // { dniDestino, fecha, items: [{id, herramienta_id, nombre, codigo, disponible}] }

async function cargarSolicitudes() {
    const { data, error } = await supabaseClient
        .from("solicitudes")
        .select(`
            *,
            herramientas!solicitudes_herramienta_id_fkey(nombre, codigo, ubicacion, estado),
            trabajadores!solicitudes_trabajador_dni_fkey(NOMBRE, APELLIDOS, CARGO)
        `)
        .eq("estado", "pendiente")
        .order("fecha_solicitud", { ascending: false });

    if (error) { console.error("Error solicitudes:", error); return; }

    const tbody = document.getElementById("tablaSolicitudes");

    if (!data || !data.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="cargando">No hay solicitudes pendientes.</td></tr>`;
        return;
    }

    // Agrupar por dni + minuto de fecha
    const grupos = {};
    data.forEach(s => {
        const minuto = s.fecha_solicitud ? s.fecha_solicitud.slice(0, 16) : "sin-fecha";
        const key    = `${s.trabajador_dni}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = {
                key,
                dniDestino:  s.trabajador_dni,
                fecha:       s.fecha_solicitud,
                trabajador:  s.trabajadores,
                items:       []
            };
        }
        // Verificar disponibilidad: en almacén y operativa
        const disponible = s.herramientas
            ? s.herramientas.ubicacion === "almacen" && s.herramientas.estado === "operativa"
            : false;

        grupos[key].items.push({
            id:            s.id,
            herramienta_id: s.herramienta_id,
            nombre:        s.herramientas?.nombre  || "—",
            codigo:        s.herramientas?.codigo  || "—",
            disponible
        });
    });

    const listaGrupos = Object.values(grupos);

    window._solGrupos = listaGrupos;

    tbody.innerHTML = listaGrupos.map((g, idx) => {
        const solicitante  = g.trabajador
            ? `${g.trabajador.NOMBRE} ${g.trabajador.APELLIDOS}`
            : "—";
        const totalItems   = g.items.length;
        const noDisponibles = g.items.filter(i => !i.disponible).length;
        const alertaStock  = noDisponibles > 0
            ? `<span class="badge-alerta-stock">⚠ ${noDisponibles} sin stock</span>`
            : "";

        return `
        <tr>
            <td>
                <div class="solicitante-cell">
                    <span class="solicitante-nombre">${solicitante}</span>
                    ${alertaStock}
                </div>
            </td>
            <td>${g.dniDestino || "—"}</td>
            <td>${totalItems} herramienta${totalItems !== 1 ? "s" : ""}</td>
            <td>${g.fecha ? formatearFecha(g.fecha) : "—"}</td>
            <td>
                <button class="btn-accion btn-detalle-sol" onclick="abrirDetalleSolicitud(${idx})">
                    🔍 Ver detalle
                </button>
            </td>
        </tr>`;
    }).join("");
}

function abrirDetalleSolicitud(idx) {
    grupoSeleccionado = window._solGrupos?.[idx];
    if (!grupoSeleccionado) return;

    const g          = grupoSeleccionado;
    const trabajador = g.trabajador || {};
    const nombre     = trabajador ? `${trabajador.NOMBRE || ""} ${trabajador.APELLIDOS || ""}`.trim() : "—";

    // Datos del solicitante
    document.getElementById("detSolNombre").textContent = nombre  || "—";
    document.getElementById("detSolDNI").textContent    = g.dniDestino || "—";
    document.getElementById("detSolCargo").textContent  = trabajador.CARGO  || "—";
    document.getElementById("detSolFecha").textContent  = g.fecha ? formatearFecha(g.fecha) : "—";

    // Lista de herramientas
    const lista = document.getElementById("detSolLista");
    lista.innerHTML = g.items.map(item => `
        <div class="det-sol-item ${item.disponible ? "" : "det-sol-item-rojo"}" >
            <div class="det-sol-item-info">
                <span class="det-sol-item-nombre">${item.nombre}</span>
                <span class="det-sol-item-codigo">Código: ${item.codigo}</span>
            </div>
            <span class="det-sol-item-estado">
                ${item.disponible
                    ? "<span class='badge badge-operativa'>✓ Disponible</span>"
                    : "<span class='badge badge-inoperativa'>✗ No disponible</span>"}
            </span>
        </div>
    `).join("");

    // Mostrar u ocultar aviso de stock
    const aviso     = document.getElementById("detSolAviso");
    const noDisp    = g.items.filter(i => !i.disponible).length;
    const disponibles = g.items.filter(i => i.disponible).length;

    if (noDisp > 0) {
        aviso.textContent = `⚠ ${noDisp} herramienta${noDisp > 1 ? "s" : ""} no disponible${noDisp > 1 ? "s" : ""}. Solo se aprobarán las ${disponibles} disponibles.`;
        aviso.classList.remove("oculto");
    } else {
        aviso.classList.add("oculto");
    }

    // Actualizar texto del botón confirmar
    const btnAprobar = document.getElementById("btnAprobarGrupo");
    if (disponibles === 0) {
        btnAprobar.textContent = "Sin herramientas disponibles";
        btnAprobar.disabled    = true;
    } else {
        btnAprobar.textContent = `✅ Aprobar ${disponibles} herramienta${disponibles !== 1 ? "s" : ""}`;
        btnAprobar.disabled    = rol !== 3;
    }

    document.getElementById("mensajeDetSol").textContent = "";
    abrirModal("modalDetalleSolicitud");
}

async function aprobarGrupo() {
    if (!grupoSeleccionado) return;

    const disponibles = grupoSeleccionado.items.filter(i => i.disponible);
    const noDisp      = grupoSeleccionado.items.filter(i => !i.disponible);
    const dniDestino  = grupoSeleccionado.dniDestino;
    const mensaje     = document.getElementById("mensajeDetSol");
    const btnAprobar  = document.getElementById("btnAprobarGrupo");

    btnAprobar.disabled    = true;
    mensaje.style.color    = "gray";
    mensaje.textContent    = "Procesando...";

    // Crear movimientos para las disponibles
    const movimientos = disponibles.map(item => ({
        herramienta_id:     item.herramienta_id,
        dni_origen:         usuarioLocal.DNI,
        dni_destino:        dniDestino,
        destino_tipo:       "persona",
        confirmado_origen:  true,
        confirmado_destino: false,
    }));

    const { error: errMov } = await supabaseClient
        .from("movimientos")
        .insert(movimientos);

    if (errMov) {
        mensaje.style.color = "red";
        mensaje.textContent = "Error: " + errMov.message;
        btnAprobar.disabled = false;
        return;
    }

    // Marcar disponibles como aprobadas
    const idsDisp = disponibles.map(i => i.id);
    await supabaseClient
        .from("solicitudes")
        .update({ estado: "aprobada", fecha_respuesta: new Date().toISOString() })
        .in("id", idsDisp);

    // Marcar no disponibles como no_disponible
    if (noDisp.length) {
        const idsNoDisp = noDisp.map(i => i.id);
        await supabaseClient
            .from("solicitudes")
            .update({ estado: "no_disponible", fecha_respuesta: new Date().toISOString() })
            .in("id", idsNoDisp);
    }

    const msg = noDisp.length
        ? `✓ ${disponibles.length} aprobada${disponibles.length !== 1 ? "s" : ""}. ${noDisp.length} marcada${noDisp.length !== 1 ? "s" : ""} como no disponible.`
        : `✓ Todas las herramientas aprobadas correctamente.`;

    mensaje.style.color = "green";
    mensaje.textContent = msg;

    setTimeout(async () => {
        cerrarModal("modalDetalleSolicitud");
        await cargarSolicitudes();
        await actualizarBadges();
    }, 1800);
}

// ─── PENDIENTES ───────────────────────────────────────────────────────────
// ─── PENDIENTES: grupos de devolución (trabajador→almacén) y de entrega (almacén→trabajador via solicitud aprobada) ─
let grupoPendienteSeleccionado = null;

async function cargarPendientes() {
    // Trae movimientos donde el almacén debe confirmar:
    // 1. Devoluciones: destino_tipo = "almacen" (trabajador devuelve)
    // 2. Entregas pendientes: ya manejadas por solicitudes — omitir (confirmado_destino ya se resuelve en panel-mi-registro)
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select(`*, herramientas!fk_mov_herramienta(nombre, codigo)`)
        .is("confirmado_origen", true)
        .is("confirmado_destino", false)
        .eq("destino_tipo", "almacen")
        .order("fecha", { ascending: false });

    if (error) { console.error("Error pendientes:", error); return; }

    const tbody = document.getElementById("tablaPendientes");

    if (!data || !data.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="cargando">No hay devoluciones pendientes.</td></tr>`;
        return;
    }

    // Agrupar por dni_origen + minuto
    const grupos = {};
    data.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const key    = `${m.dni_origen}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = { key, dniOrigen: m.dni_origen, fecha: m.fecha, items: [] };
        }
        grupos[key].items.push({
            id_mov:         m.id_mov,
            herramienta_id: m.herramienta_id,
            nombre:         m.herramientas?.nombre || "—",
            codigo:         m.herramientas?.codigo || "—",
        });
    });

    // Traer nombres de trabajadores
    const dnis = [...new Set(Object.values(grupos).map(g => g.dniOrigen).filter(Boolean))];
    let trabajadores = {};
    if (dnis.length) {
        const { data: workers } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .in("DNI", dnis);
        if (workers) workers.forEach(w => { trabajadores[w.DNI] = w; });
    }

    const listaGrupos = Object.values(grupos).map(g => ({ ...g, trabajador: trabajadores[g.dniOrigen] || null }));

    window._pendAlmGrupos = listaGrupos;

    tbody.innerHTML = listaGrupos.map((g, idx) => {
        const trabajador = g.trabajador;
        const nombre = trabajador
            ? `${trabajador.NOMBRE} ${trabajador.APELLIDOS}`
            : g.dniOrigen || "—";
        const total = g.items.length;

        return `
        <tr>
            <td>
                <div class="solicitante-cell">
                    <span class="solicitante-nombre">${nombre}</span>
                    <span style="font-size:0.75rem;color:#8a97b8">${g.dniOrigen}</span>
                </div>
            </td>
            <td>${total} herramienta${total !== 1 ? "s" : ""}</td>
            <td>${g.fecha ? formatearFecha(g.fecha) : "—"}</td>
            <td>
                <button class="btn-accion btn-detalle-sol" onclick="abrirDetallePendienteAlmacen(${idx})">
                    🔍 Ver detalle
                </button>
            </td>
        </tr>`;
    }).join("");
}

function abrirDetallePendienteAlmacen(idx) {
    grupoPendienteSeleccionado = window._pendAlmGrupos?.[idx];
    if (!grupoPendienteSeleccionado) return;
    const g   = grupoPendienteSeleccionado;
    const trab = g.trabajador || {};

    document.getElementById("pendAlmNombre").textContent = trab.NOMBRE && trab.APELLIDOS
        ? `${trab.NOMBRE} ${trab.APELLIDOS}` : g.dniOrigen || "—";
    document.getElementById("pendAlmDNI").textContent    = g.dniOrigen  || "—";
    document.getElementById("pendAlmCargo").textContent  = trab.CARGO   || "—";
    document.getElementById("pendAlmFecha").textContent  = g.fecha ? formatearFecha(g.fecha) : "—";

    const lista = document.getElementById("pendAlmLista");
    lista.innerHTML = g.items.map(item => `
        <div class="det-sol-item">
            <div class="det-sol-item-info">
                <span class="det-sol-item-nombre">${item.nombre}</span>
                <span class="det-sol-item-codigo">Código: ${item.codigo}</span>
            </div>
        </div>
    `).join("");

    document.getElementById("mensajePendAlm").textContent = "";
    document.getElementById("btnAceptarDevolucion").disabled = rol !== 3;
    abrirModal("modalPendienteAlmacen");
}

async function aceptarDevolucion() {
    const g       = grupoPendienteSeleccionado;
    const mensaje = document.getElementById("mensajePendAlm");
    const btn     = document.getElementById("btnAceptarDevolucion");

    btn.disabled        = true;
    mensaje.style.color = "gray";
    mensaje.textContent = "Confirmando recepción...";

    const errores = [];
    for (const item of g.items) {
        try {
            const { data: _res, error: _fnErr } = await supabaseClient.functions.invoke("smart-endpoint", {
                method:  "POST",
                body: {
                    id_mov:         item.id_mov,
                    herramienta_id: item.herramienta_id,
                    trabajador_dni: usuarioLocal.DNI,
                    destino_tipo:   "almacen"
                }
            });
            if (_fnErr || _res?.error) errores.push(item.nombre);
        } catch (err) {
            errores.push(item.nombre);
        }
    }

    if (errores.length) {
        mensaje.style.color = "orange";
        mensaje.textContent = `Errores en: ${errores.join(", ")}`;
        btn.disabled = false;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = `✓ ${g.items.length} herramienta${g.items.length > 1 ? "s recibidas" : " recibida"} en almacén.`;

    setTimeout(async () => {
        cerrarModal("modalPendienteAlmacen");
        await cargarPendientes();
        await actualizarBadges();
        await cargarStock();
    }, 1600);
}

async function rechazarDevolucion() {
    if (!grupoPendienteSeleccionado) return;

    const mensaje     = document.getElementById("mensajePendAlm");
    const btnAceptar  = document.getElementById("btnAceptarDevolucion");
    const btnRechazar = document.querySelector("#modalPendienteAlmacen .btn-rechazar");

    const confirmar = window.confirm("¿Rechazás esta devolución? Los movimientos se eliminarán sin registro.");
    if (!confirmar) return;

    if (btnRechazar) btnRechazar.disabled = true;
    if (btnAceptar)  btnAceptar.disabled  = true;
    mensaje.style.color = "gray";
    mensaje.textContent = "Rechazando...";

    const ids = grupoPendienteSeleccionado.items.map(i => i.id_mov);

    // Usamos UPDATE en vez de DELETE: la política movimientos_update
    // permite al destino actualizar, mientras que movimientos_delete solo
    // permite al origen. Además deja trazabilidad del rechazo.
    const { data: updated, error } = await supabaseClient
        .from("movimientos")
        .update({
            estado:             "rechazado",
            confirmado_destino: true,
            fecha_confirmacion: new Date().toISOString(),
            dni_destino:        usuarioLocal.DNI,
        })
        .in("id_mov", ids)
        .select("id_mov");

    if (error) {
        mensaje.style.color = "red";
        mensaje.textContent = "Error: " + error.message;
        if (btnRechazar) btnRechazar.disabled = false;
        if (btnAceptar)  btnAceptar.disabled  = false;
        return;
    }

    // Si RLS filtró silenciosamente, updated vendrá vacío
    if (!updated || updated.length === 0) {
        mensaje.style.color = "red";
        mensaje.textContent = "Sin permisos para rechazar este movimiento. Contactá al administrador.";
        if (btnRechazar) btnRechazar.disabled = false;
        if (btnAceptar)  btnAceptar.disabled  = false;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = "✓ Devolución rechazada.";

    setTimeout(async () => {
        cerrarModal("modalPendienteAlmacen");
        await cargarPendientes();
        await actualizarBadges();
    }, 1200);
}

// ─── RECHAZAR SOLICITUD DE TRABAJADOR ────────────────────────────────────
async function rechazarGrupo() {
    if (!grupoSeleccionado) return;

    confirmarAccion("¿Rechazás este pedido? Todas las solicitudes serán marcadas como rechazadas.", async () => {
        const mensaje    = document.getElementById("mensajeDetSol");
        const btnAprobar = document.getElementById("btnAprobarGrupo");
        const btnRechazar = document.getElementById("btnRechazarGrupo");

        btnAprobar.disabled  = true;
        btnRechazar.disabled = true;
        mensaje.style.color  = "gray";
        mensaje.textContent  = "Rechazando...";

        const ids = grupoSeleccionado.items.map(i => i.id);
        const { error } = await supabaseClient
            .from("solicitudes")
            .update({ estado: "cancelada", fecha_respuesta: new Date().toISOString() })
            .in("id", ids);

        if (error) {
            mensaje.style.color  = "red";
            mensaje.textContent  = "Error: " + error.message;
            btnAprobar.disabled  = false;
            btnRechazar.disabled = false;
            return;
        }

        mensaje.style.color = "green";
        mensaje.textContent = "✓ Pedido rechazado.";

        setTimeout(async () => {
            cerrarModal("modalDetalleSolicitud");
            await cargarSolicitudes();
            await actualizarBadges();
        }, 1400);
    });
}

// ─── HISTORIAL ────────────────────────────────────────────────────────────
let historialData = [];

async function cargarHistorial() {
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select(`*, herramientas!fk_mov_herramienta(nombre, codigo, categoria, modelo, estado)`)
        .or(`dni_origen.eq.${usuarioLocal.DNI},destino_tipo.eq.almacen`)
        .is("confirmado_origen", true)
        .in("estado", ["confirmado", "rechazado"])
        .order("fecha", { ascending: false })
        .limit(200);

    if (error) { console.error("Error historial:", error); return; }

    historialData = data || [];

    const contenedor = document.getElementById("tablaHistorial");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    if (!historialData.length) {
        contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">No hay movimientos registrados.</p>`;
        return;
    }

    // Agrupar por origen + minuto (igual que panel-mi-registro)
    const grupos = {};
    historialData.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const key    = `${m.dni_origen || "almacen"}__${m.dni_destino || m.destino_tipo}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = {
                key,
                dniOrigen:   m.dni_origen,
                dniDestino:  m.dni_destino,
                dniGestor:   m.dni_destino,   // quien confirmó o rechazó
                destinoTipo: m.destino_tipo,
                fecha:       m.fecha,
                fechaConf:   m.fecha_confirmacion,
                observacion: m.observacion,
                estado:      m.estado,
                items:       []
            };
        }
        grupos[key].items.push({
            id_mov:    m.id_mov,
            codigo:    m.herramientas?.codigo    || "—",
            nombre:    m.herramientas?.nombre    || "—",
            categoria: m.herramientas?.categoria || "—",
            modelo:    m.herramientas?.modelo    || "—",
            estado:    m.herramientas?.estado    || "—",
        });
    });

    // Traer nombres de todos los DNIs involucrados
    const dnis = [...new Set(
        Object.values(grupos).flatMap(g => [g.dniOrigen, g.dniDestino, g.dniGestor].filter(Boolean))
    )];
    let personas = {};
    if (dnis.length) {
        const { data: workers } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .in("DNI", dnis);
        if (workers) workers.forEach(w => { personas[w.DNI] = w; });
    }

    const listaGrupos = Object.values(grupos);

    listaGrupos.forEach((g, idx) => {
        const origen  = g.dniOrigen  ? personas[g.dniOrigen]  : null;
        const destino = g.dniDestino ? personas[g.dniDestino] : null;

        const nombreOrigen  = origen
            ? `${origen.NOMBRE} ${origen.APELLIDOS}`
            : (g.dniOrigen ? g.dniOrigen : "🏭 Almacén");
        const nombreDestino = destino
            ? `${destino.NOMBRE} ${destino.APELLIDOS}`
            : (g.destinoTipo === "almacen" ? "🏭 Almacén" : g.dniDestino || "—");

        const esRechazado  = g.estado === "rechazado";
        const esDeAlmacen  = g.dniOrigen === usuarioLocal.DNI || g.destinoTipo === "almacen" && !g.dniOrigen;

        const tagEstado = esRechazado
            ? `<span class="hist-tag hist-tag-rechazado">❌ Rechazado</span>`
            : g.destinoTipo === "almacen"
            ? `<span class="hist-tag hist-tag-recibido">📥 Devuelto</span>`
            : `<span class="hist-tag hist-tag-enviado">📤 Entregado</span>`;

        const total = g.items.length;

        // Info de quién gestionó (aceptó o rechazó) — columna dni_destino
        const gestorDNI    = g.dniGestor || null;
        const gestorNombre = gestorDNI && personas[gestorDNI]
            ? `${personas[gestorDNI].NOMBRE} ${personas[gestorDNI].APELLIDOS}`
            : gestorDNI || "—";
        const gestionLabel  = esRechazado ? "Rechazado por" : "Aceptado por";
        const gestionColor  = esRechazado ? "color:#e53e3e" : "color:#2e7d32";
        const rechazadoPor  = gestorDNI
            ? `<div class="hist-persona-dato" style="${gestionColor}">
                   <span class="hist-dato-label">${gestionLabel}</span>
                   <span>${gestorNombre} — DNI: ${gestorDNI}</span>
               </div>`
            : "";

        const bloque = document.createElement("div");
        bloque.className = "hist-bloque";
        bloque.id = `hist-bloque-alm-${idx}`;
        bloque.innerHTML = `
            <div class="hist-bloque-header" onclick="toggleHistBloqueAlm(${idx})">
                <div class="hist-bloque-left">
                    ${tagEstado}
                    <div class="hist-bloque-personas">
                        <span class="hist-persona-origen">${nombreOrigen}</span>
                        <span class="hist-flecha">→</span>
                        <span class="hist-persona-destino">${nombreDestino}</span>
                    </div>
                </div>
                <div class="hist-bloque-right">
                    <span class="hist-bloque-count">${total} herramienta${total !== 1 ? "s" : ""}</span>
                    <span class="hist-bloque-fecha">${g.fecha ? formatearFecha(g.fecha) : "—"}</span>
                    <span class="hist-chevron" id="alm-chevron-${idx}">▼</span>
                </div>
            </div>

            <div class="hist-bloque-detalle oculto" id="alm-detalle-${idx}">
                <div class="hist-personas-grid">
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📤 Origen</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniOrigen || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreOrigen}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${origen?.CARGO || "—"}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📥 Destino</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniDestino || (g.destinoTipo === "almacen" ? "Almacén" : "—")}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreDestino}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${destino?.CARGO || (g.destinoTipo === "almacen" ? "Almacenero" : "—")}</span></div>
                        ${rechazadoPor}
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📅 Fechas y Obs.</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Emisión</span><span>${g.fecha ? formatearFecha(g.fecha) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Confirmación</span><span>${g.fechaConf ? formatearFecha(g.fechaConf) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Observación</span><span>${g.observacion || "—"}</span></div>
                    </div>
                </div>

                <div class="hist-herr-titulo">🔧 Herramientas</div>
                <div class="tabla-wrapper">
                    <table class="tabla tabla-sm">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Categoría</th>
                                <th>Modelo</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${g.items.map(item => `
                            <tr>
                                <td>${item.codigo}</td>
                                <td>${item.nombre}</td>
                                <td>${item.categoria}</td>
                                <td>${item.modelo}</td>
                                <td>${badgeEstado(item.estado)}</td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        contenedor.appendChild(bloque);
    });
}

function toggleHistBloqueAlm(idx) {
    const detalle = document.getElementById(`alm-detalle-${idx}`);
    const chevron = document.getElementById(`alm-chevron-${idx}`);
    const bloque  = document.getElementById(`hist-bloque-alm-${idx}`);

    if (!detalle || !chevron || !bloque) {
        console.warn(`toggleHistBloqueAlm: elementos no encontrados para idx=${idx}`);
        return;
    }

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


// ─── EXPORTAR ─────────────────────────────────────────────────────────────
async function exportarInventario() {
    const { data, error } = await supabaseClient
        .from("herramientas")
        .select("*, trabajadores(NOMBRE, APELLIDOS)")
        .order("ubicacion")
        .order("nombre");

    if (error || !data || !data.length) { alert("No hay herramientas para exportar."); return; }

    const filas = [["Código", "Nombre", "Categoría", "Modelo", "Estado", "Ubicación", "Trabajador DNI", "Trabajador Nombre"]];
    data.forEach(h => filas.push([
        h.codigo    || "", h.nombre    || "", h.categoria || "", h.modelo || "",
        h.estado    || "", h.ubicacion || "", h.trabajador_dni || "",
        h.trabajadores ? `${h.trabajadores.NOMBRE} ${h.trabajadores.APELLIDOS}` : ""
    ]));

    exportarCSV(filas, "inventario");
}

function exportarHistorialAlmacen() {
    if (!historialData.length) { alert("No hay datos para exportar."); return; }

    const filas = [["Código", "Herramienta", "DNI Origen", "DNI Destino", "Tipo", "Observación", "Fecha Emisión", "Fecha Confirmación"]];
    historialData.forEach(m => filas.push([
        m.herramientas ? m.herramientas.codigo || "" : m.herramienta_id,
        m.herramientas ? m.herramientas.nombre || "" : "",
        m.dni_origen   || "", m.dni_destino || "",
        m.destino_tipo === "almacen" ? "Almacén" : "Persona",
        m.observacion  || "",
        m.fecha              ? formatearFecha(m.fecha)              : "",
        m.fecha_confirmacion ? formatearFecha(m.fecha_confirmacion) : ""
    ]));

    exportarCSV(filas, "historial_almacen");
}

// ─── INICIO ───────────────────────────────────────────────────────────────
// ─── HISTORIAL DE ESTADOS (TAB PANEL ALMACÉN) ────────────────────────────
let historialEstadosAlmacenData = [];

async function cargarHistorialEstadosAlmacen() {
    const contenedor = document.getElementById("tablaHistorialEstadosAlmacen");
    if (!contenedor) return;

    contenedor.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">Cargando...</p>`;

    const { data, error } = await supabaseClient
        .from("historial_estados")
        .select(`
            *,
            herramientas!historial_estados_herramienta_id_fkey(nombre, codigo),
            trabajadores!historial_estados_trabajador_dni_fkey(NOMBRE, APELLIDOS)
        `)
        .order("fecha", { ascending: false })
        .limit(300);

    if (error) {
        contenedor.innerHTML = `<p class="cargando" style="color:red;padding:30px;text-align:center">Error: ${error.message}</p>`;
        return;
    }

    historialEstadosAlmacenData = data || [];

    if (!historialEstadosAlmacenData.length) {
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
            ${historialEstadosAlmacenData.map(r => `
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

function exportarHistorialEstadosAlmacen() {
    if (!historialEstadosAlmacenData.length) {
        alert("No hay datos para exportar. Abrí el tab primero.");
        return;
    }

    const filas = [["Herramienta", "Código", "Estado Anterior", "Estado Nuevo", "Justificación", "Responsable", "Fecha"]];
    historialEstadosAlmacenData.forEach(r => filas.push([
        r.herramientas?.nombre || "",
        r.herramientas?.codigo || r.herramienta_id || "",
        r.estado_anterior      || "",
        r.estado_nuevo         || "",
        r.descripcion          || "",
        r.trabajadores ? r.trabajadores.NOMBRE + " " + r.trabajadores.APELLIDOS : r.trabajador_dni || "",
        r.fecha ? formatearFecha(r.fecha) : "",
    ]));

    exportarCSV(filas, "historial_estados_almacen");
}

// ─── JUSTIFICACIONES DE ESTADO ───────────────────────────────────────────
async function abrirModalJustificacion(codigo, nombre) {
    document.getElementById("justNombre").textContent = nombre;
    document.getElementById("justLista").innerHTML = `<p class="cargando" style="padding:16px;text-align:center">Cargando...</p>`;
    abrirModal("modalJustificacion");

    const { data, error } = await supabaseClient
        .from("historial_estados")
        .select(`*, trabajadores!historial_estados_trabajador_dni_fkey(NOMBRE, APELLIDOS)`)
        .eq("herramienta_id", codigo)
        .order("fecha", { ascending: false });

    const lista = document.getElementById("justLista");

    if (error || !data || !data.length) {
        lista.innerHTML = `<p class="cargando" style="padding:16px;text-align:center">Sin registros.</p>`;
        return;
    }

    lista.innerHTML = data.map(r => {
        const quien = r.trabajadores
            ? `${r.trabajadores.NOMBRE} ${r.trabajadores.APELLIDOS}`
            : r.trabajador_dni;
        return `
        <div class="just-item">
            <div class="just-item-header">
                <span class="just-estados">
                    <span class="badge badge-${r.estado_anterior}">${r.estado_anterior}</span>
                    <span class="just-flecha">→</span>
                    <span class="badge badge-${r.estado_nuevo}">${r.estado_nuevo}</span>
                </span>
                <span class="just-fecha">${r.fecha ? formatearFecha(r.fecha) : "—"}</span>
            </div>
            <div class="just-desc">${r.descripcion}</div>
            <div class="just-quien">👤 ${quien}</div>
        </div>`;
    }).join("");
}

verificarCuentaActiva(usuarioLocal);
iniciar();