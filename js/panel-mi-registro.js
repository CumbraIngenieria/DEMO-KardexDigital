// panel-mi-registro.js
// Depende de: supabaseClient.js, utils.js

// Protección - trabajadores (4), supervisores (2) y técnico (1)
const usuarioLocal = obtenerUsuario();
const rol = usuarioLocal["ID ROL"] || usuarioLocal.id_rol || 4;
verificarRol([1, 2, 4], rol);

const miDNI = usuarioLocal.DNI;

let movimientoSeleccionado  = null;
let herramientaTransferir   = null;
let codigosEnMovimiento     = new Set(); // códigos con movimiento pendiente activo

// Carritos de selección múltiple
let seleccionAlmacen    = []; // [{ codigo, nombre }]  máx 10
let seleccionTransferir = []; // [{ codigo, nombre }]  máx 5
const LIMITE_ALMACEN    = 10;
const LIMITE_TRANSFERIR = 5;

// ─── ARRAY GLOBAL DE GRUPOS PENDIENTES ───────────────────────────────────
// Guardamos los grupos aquí para referenciarlos por índice desde los onclick
window._pendGrupos = [];

// Callbacks para mostrarTab (definido en utils.js)
const tabCallbacks = {
    pendientes: cargarPendientes,
    enviados:   () => { cargarEnviados(); contarEnviados(); },
    historial:  cargarHistorial,
};

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────
async function iniciar() {
    await Promise.all([cargarMisHerramientas(), contarPendientes(), contarEnviados()]);
}

// ─── MIS HERRAMIENTAS ─────────────────────────────────────────────────────
async function cargarMisHerramientas() {
    seleccionAlmacen    = [];
    seleccionTransferir = [];
    actualizarBotonesAccion();

    const { data, error } = await supabaseClient
        .from("herramientas")
        .select("*")
        .eq("trabajador_dni", miDNI)
        .order("nombre");

    if (error) { console.error(error); return; }

    const tbody = document.getElementById("tablaHerramientas");

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="cargando">No tenés herramientas asignadas.</td></tr>`;
        return;
    }

    // Consultar herramientas con movimiento pendiente
    const codigos = data.map(h => h.codigo);
    const { data: movPendientes } = await supabaseClient
        .from("movimientos")
        .select("herramienta_id")
        .in("herramienta_id", codigos)
        .is("confirmado_destino", false);

    codigosEnMovimiento = new Set(movPendientes ? movPendientes.map(m => m.herramienta_id) : []);

    tbody.innerHTML = data.map(h => {
        const enMovimiento = codigosEnMovimiento.has(h.codigo);
        const checkHTML = enMovimiento
            ? `<input type="checkbox" class="check-herramienta" disabled title="En movimiento pendiente">`
            : `<input type="checkbox" class="check-herramienta" id="chk-${h.codigo}"
                    onchange="toggleSeleccion(${h.codigo}, '${h.nombre.replace(/'/g, '')}', this.checked)">`;
        const filaBloqueada   = enMovimiento ? `style="opacity:0.55"` : "";
        const badgeMovimiento = enMovimiento
            ? `<span class="badge badge-mantenimiento" style="font-size:0.7rem;margin-left:4px">⏳ En movimiento</span>`
            : "";
        return `
        <tr id="fila-herr-${h.codigo}" ${filaBloqueada}>
            <td>${checkHTML}</td>
            <td>${h.codigo    || "—"}</td>
            <td>${h.nombre    || "—"} ${badgeMovimiento}</td>
            <td>${h.Categoria || h.categoria || "—"}</td>
            <td>${h.modelo    || "—"}</td>
            <td>${badgeEstado(h.estado)}</td>
        </tr>`;
    }).join("");
}

// ─── SELECCIÓN MÚLTIPLE INDEPENDIENTE ────────────────────────────────────
function toggleSeleccion(codigo, nombre, checked) {
    if (codigosEnMovimiento.has(codigo)) return;
    if (checked) {
        if (!seleccionAlmacen.some(h => h.codigo === codigo)) {
            seleccionAlmacen.push({ codigo, nombre });
        }
        if (!seleccionTransferir.some(h => h.codigo === codigo)) {
            seleccionTransferir.push({ codigo, nombre });
        }
    } else {
        seleccionAlmacen    = seleccionAlmacen.filter(h => h.codigo !== codigo);
        seleccionTransferir = seleccionTransferir.filter(h => h.codigo !== codigo);
    }
    actualizarBotonesAccion();
}

function actualizarBotonesAccion() {
    const totalSel    = seleccionAlmacen.length;
    const btnAlmacen  = document.getElementById("btnEnviarAlmacen");
    const btnTransf   = document.getElementById("btnAbrirTransferir");
    const badgeAlm    = document.getElementById("badgeSelAlmacen");
    const badgeTransf = document.getElementById("badgeSelTransferir");

    if (totalSel > 0) {
        badgeAlm.textContent = totalSel;
        badgeAlm.classList.remove("oculto");
        if (totalSel > LIMITE_ALMACEN) {
            btnAlmacen.disabled = true;
            btnAlmacen.title    = `Máximo ${LIMITE_ALMACEN} herramientas para enviar al almacén`;
        } else {
            btnAlmacen.disabled = false;
            btnAlmacen.title    = "";
        }
    } else {
        badgeAlm.classList.add("oculto");
        btnAlmacen.disabled = false;
        btnAlmacen.title    = "";
    }

    if (totalSel > 0) {
        badgeTransf.textContent = totalSel;
        badgeTransf.classList.remove("oculto");
        if (totalSel > LIMITE_TRANSFERIR) {
            btnTransf.disabled = true;
            btnTransf.title    = `Máximo ${LIMITE_TRANSFERIR} herramientas para transferir`;
        } else {
            btnTransf.disabled = false;
            btnTransf.title    = "";
        }
    } else {
        badgeTransf.classList.add("oculto");
        btnTransf.disabled = false;
        btnTransf.title    = "";
    }
}

// ─── ENVIAR A ALMACÉN (múltiple) ──────────────────────────────────────────
function abrirModalAlmacen() {
    if (!seleccionAlmacen.length) {
        alert("Seleccioná al menos una herramienta.");
        return;
    }
    if (seleccionAlmacen.length > LIMITE_ALMACEN) {
        alert(`Máximo ${LIMITE_ALMACEN} herramientas para enviar al almacén. Tenés ${seleccionAlmacen.length} seleccionadas.`);
        return;
    }

    const lista = document.getElementById("almacenLista");
    lista.innerHTML = seleccionAlmacen.map(h => `
        <div class="carrito-item">
            <div class="carrito-item-info">
                <span class="carrito-item-nombre">${h.nombre}</span>
                <span class="carrito-item-codigo">Código: ${h.codigo}</span>
            </div>
        </div>
    `).join("");

    document.getElementById("mensajeAlmacen").textContent = "";
    document.getElementById("btnConfirmarAlmacen").disabled = false;
    abrirModal("modalAlmacen");
}

async function confirmarEnvioAlmacen() {
    const mensaje   = document.getElementById("mensajeAlmacen");
    const btn       = document.getElementById("btnConfirmarAlmacen");

    btn.disabled        = true;
    mensaje.style.color = "gray";
    mensaje.textContent = "Verificando...";

    const codigos = seleccionAlmacen.map(h => h.codigo);
    const { data: pendientes } = await supabaseClient
        .from("movimientos")
        .select("herramienta_id")
        .in("herramienta_id", codigos)
        .is("confirmado_destino", false);

    if (pendientes && pendientes.length) {
        const bloqueadas = pendientes.map(p => {
            const h = seleccionAlmacen.find(s => s.codigo === p.herramienta_id);
            return h ? h.nombre : p.herramienta_id;
        });
        mensaje.style.color = "orange";
        mensaje.textContent = `Ya tienen movimiento pendiente: ${bloqueadas.join(", ")}. Quitá el check y reintentá.`;
        btn.disabled = false;
        return;
    }

    mensaje.textContent = "Enviando...";

    const ahora = new Date().toISOString();
    const movimientos = seleccionAlmacen.map(h => ({
        herramienta_id:     h.codigo,
        dni_origen:         miDNI,
        dni_destino:        null,
        destino_tipo:       "almacen",
        confirmado_origen:  true,
        confirmado_destino: false,
        fecha:              ahora,
        estado:             "pendiente",
    }));

    const { error } = await supabaseClient.from("movimientos").insert(movimientos);

    if (error) {
        mensaje.style.color = "red";
        mensaje.textContent = "Error: " + error.message;
        btn.disabled = false;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = `✓ ${seleccionAlmacen.length} herramienta${seleccionAlmacen.length > 1 ? "s enviadas" : " enviada"} al almacén.`;

    codigos.forEach(c => {
        const chk = document.getElementById(`chk-${c}`);
        if (chk) chk.checked = false;
    });
    seleccionAlmacen    = [];
    seleccionTransferir = [];
    actualizarBotonesAccion();

    setTimeout(async () => {
        cerrarModal("modalAlmacen");
        await cargarMisHerramientas();
        await contarEnviados();
    }, 1600);
}

// ─── TRANSFERIR (múltiple) ────────────────────────────────────────────────
function abrirModalTransferirMultiple() {
    if (!seleccionTransferir.length) {
        alert("Seleccioná al menos una herramienta.");
        return;
    }
    if (seleccionTransferir.length > LIMITE_TRANSFERIR) {
        alert(`Máximo ${LIMITE_TRANSFERIR} herramientas para transferir. Tenés ${seleccionTransferir.length} seleccionadas, quitá algunas.`);
        return;
    }

    const lista = document.getElementById("transferirLista");
    lista.innerHTML = seleccionTransferir.map(h => `
        <div class="carrito-item">
            <div class="carrito-item-info">
                <span class="carrito-item-nombre">${h.nombre}</span>
                <span class="carrito-item-codigo">Código: ${h.codigo}</span>
            </div>
        </div>
    `).join("");

    document.getElementById("transferirDNI").value              = "";
    document.getElementById("transferirNombreDest").textContent = "—";
    document.getElementById("transferirObservacion").value      = "";
    document.getElementById("mensajeTransferir").textContent    = "";
    abrirModal("modalTransferir");
}

document.getElementById("transferirDNI").addEventListener("input", async function() {
    const dni     = this.value.trim();
    const preview = document.getElementById("transferirNombreDest");
    if (dni.length < 6) { preview.textContent = "—"; return; }

    const { data } = await supabaseClient
        .from("trabajadores")
        .select("NOMBRE, APELLIDOS, \"ID ROL\"")
        .eq("DNI", dni)
        .maybeSingle();

    if (!data) {
        preview.style.color = "#c62828";
        preview.textContent = "Trabajador no encontrado";
        return;
    }

    if (data["ID ROL"] === 3) {
        preview.style.color = "#c62828";
        preview.textContent = "No podés transferir a un almacenero. Usá el botón 📦 Almacén.";
        return;
    }

    preview.style.color = "#0d6efd";
    preview.textContent = `${data.NOMBRE} ${data.APELLIDOS}`;
});

async function confirmarTransferencia() {
    const dniDestino  = document.getElementById("transferirDNI").value.trim();
    const observacion = document.getElementById("transferirObservacion").value.trim();
    const mensaje     = document.getElementById("mensajeTransferir");

    if (!seleccionTransferir.length) {
        mensaje.style.color = "red";
        mensaje.textContent = "No hay herramientas seleccionadas.";
        return;
    }

    if (!dniDestino) {
        mensaje.style.color = "red";
        mensaje.textContent = "Ingresá el DNI del trabajador destino.";
        return;
    }

    if (dniDestino === miDNI) {
        mensaje.style.color = "red";
        mensaje.textContent = "No podés transferirte herramientas a vos mismo.";
        return;
    }

    const { data: trabajador } = await supabaseClient
        .from("trabajadores")
        .select("DNI, \"ID ROL\"")
        .eq("DNI", dniDestino)
        .single();

    if (!trabajador) {
        mensaje.style.color = "red";
        mensaje.textContent = "DNI no encontrado.";
        return;
    }

    if (trabajador["ID ROL"] === 3) {
        mensaje.style.color = "red";
        mensaje.textContent = "No podés transferir a un almacenero. Usá 📦 Enviar a Almacén.";
        return;
    }

    mensaje.style.color = "gray";
    mensaje.textContent = "Verificando...";

    const codigos = seleccionTransferir.map(h => h.codigo);
    const { data: pendientes } = await supabaseClient
        .from("movimientos")
        .select("herramienta_id")
        .in("herramienta_id", codigos)
        .is("confirmado_destino", false);

    if (pendientes && pendientes.length) {
        const bloqueadas = pendientes.map(p => {
            const h = seleccionTransferir.find(s => s.codigo === p.herramienta_id);
            return h ? h.nombre : p.herramienta_id;
        });
        mensaje.style.color = "orange";
        mensaje.textContent = `Ya tienen movimiento pendiente: ${bloqueadas.join(", ")}.`;
        return;
    }

    mensaje.textContent = "Enviando transferencias...";

    const ahora = new Date().toISOString();
    const movimientos = seleccionTransferir.map(h => ({
        herramienta_id:     h.codigo,
        dni_origen:         miDNI,
        dni_destino:        dniDestino,
        destino_tipo:       "persona",
        observacion:        observacion || null,
        confirmado_origen:  true,
        confirmado_destino: false,
        fecha:              ahora,
        estado:             "pendiente",
    }));

    const { error } = await supabaseClient.from("movimientos").insert(movimientos);

    if (error) {
        mensaje.style.color = "red";
        mensaje.textContent = "Error: " + error.message;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = `✓ ${seleccionTransferir.length} herramienta${seleccionTransferir.length > 1 ? "s transferidas" : " transferida"}. Esperando confirmación.`;

    codigos.forEach(c => {
        const chk = document.getElementById(`chk-${c}`);
        if (chk) chk.checked = false;
    });
    seleccionAlmacen    = [];
    seleccionTransferir = [];
    actualizarBotonesAccion();

    setTimeout(async () => {
        cerrarModal("modalTransferir");
        await cargarMisHerramientas();
        await contarEnviados();
    }, 1600);
}

// ─── ENVIADOS ─────────────────────────────────────────────────────────────
async function contarEnviados() {
    const { data } = await supabaseClient
        .from("movimientos")
        .select("id_mov")
        .eq("dni_origen", miDNI)
        .eq("estado", "pendiente");

    actualizarBadge("badgeEnviados", data?.length || 0);
}

async function cargarEnviados() {
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select("*, herramientas!fk_mov_herramienta(nombre, codigo, categoria, modelo, estado)")
        .eq("dni_origen", miDNI)
        .eq("estado", "pendiente")
        .order("fecha", { ascending: false });

    if (error) { console.error(error); return; }

    const tabEnviados = document.getElementById("tab-enviados");
    const infoTab = tabEnviados.querySelector(".info-tab");
    tabEnviados.innerHTML = "";
    if (infoTab) tabEnviados.appendChild(infoTab.cloneNode(true));

    if (!data || !data.length) {
        const p = document.createElement("p");
        p.className = "cargando";
        p.style.cssText = "padding:30px;text-align:center";
        p.textContent = "No tenés transferencias pendientes de confirmación.";
        tabEnviados.appendChild(p);
        return;
    }

    // Agrupar por destino + minuto de fecha
    const grupos = {};
    data.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const dest   = m.destino_tipo === "almacen" ? "almacen" : (m.dni_destino || "—");
        const key    = `${dest}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = {
                key,
                dniDestino:  m.dni_destino,
                destinoTipo: m.destino_tipo,
                fecha:       m.fecha,
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

    // Traer nombres de destinatarios
    const dnis = [...new Set(Object.values(grupos).map(g => g.dniDestino).filter(Boolean))];
    let personas = {};
    if (dnis.length) {
        const { data: workers } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .in("DNI", dnis);
        if (workers) workers.forEach(w => { personas[w.DNI] = w; });
    }

    const listaGrupos = Object.values(grupos);
    const envLista = document.createElement("div");
    envLista.className = "hist-lista";
    tabEnviados.appendChild(envLista);

    window._envGrupos = listaGrupos;

    envLista.innerHTML = listaGrupos.map((g, idx) => {
        const dest        = g.dniDestino ? personas[g.dniDestino] : null;
        const nombreDest  = dest
            ? `${dest.NOMBRE} ${dest.APELLIDOS}`
            : (g.destinoTipo === "almacen" ? "🏭 Almacén" : g.dniDestino || "—");
        const total       = g.items.length;

        return `
        <div class="hist-bloque" id="env-bloque-${idx}">

            <!-- CABECERA -->
            <div class="hist-bloque-header" onclick="toggleEnvBloque(${idx})">
                <div class="hist-bloque-left">
                    <span class="hist-tag hist-tag-enviado">📤 Enviado</span>
                    <div class="hist-bloque-personas">
                        <span class="hist-persona-origen">Vos</span>
                        <span class="hist-flecha">→</span>
                        <span class="hist-persona-destino">${nombreDest}</span>
                    </div>
                </div>
                <div class="hist-bloque-right">
                    <span class="hist-bloque-count">${total} herramienta${total !== 1 ? "s" : ""}</span>
                    <span class="hist-bloque-fecha">${g.fecha ? formatearFecha(g.fecha) : "—"}</span>
                    <span class="hist-chevron" id="env-chevron-${idx}">▼</span>
                </div>
            </div>

            <!-- DETALLE EXPANDIBLE -->
            <div class="hist-bloque-detalle oculto" id="env-detalle-${idx}">

                <!-- INFO DESTINO -->
                <div class="hist-personas-grid">
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📥 Destinatario</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniDestino || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreDest}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${dest?.CARGO || (g.destinoTipo === "almacen" ? "Almacenero" : "—")}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📅 Fecha y Obs.</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Emisión</span><span>${g.fecha ? formatearFecha(g.fecha) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Observación</span><span>${g.observacion || "—"}</span></div>
                    </div>
                </div>

                <!-- TABLA DE HERRAMIENTAS -->
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
                                <th id="env-th-quitar-${idx}" class="oculto">Quitar</th>
                            </tr>
                        </thead>
                        <tbody id="env-tbody-${idx}">
                            ${g.items.map(item => `
                            <tr id="env-fila-${item.id_mov}">
                                <td>${item.codigo}</td>
                                <td>${item.nombre}</td>
                                <td>${item.categoria}</td>
                                <td>${item.modelo}</td>
                                <td>${badgeEstado(item.estado)}</td>
                                <td class="env-td-quitar oculto" id="env-td-quitar-${item.id_mov}">
                                    <button class="btn-cancelar-sol"
                                        onclick="event.stopPropagation(); quitarItemEnviado(${item.id_mov}, ${idx})">
                                        ✕ Quitar
                                    </button>
                                </td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>

                <!-- ACCIONES -->
                <div class="pend-acciones" id="env-acciones-${idx}">
                    <div class="pend-mensaje" id="env-mensaje-${idx}"></div>
                    <div class="pend-botones">
                        <button class="btn-editar-env" id="env-btn-editar-${idx}" onclick="event.stopPropagation(); toggleModoEdicion(${idx})">
                            ✏ Editar
                        </button>
                        <button class="btn-rechazar" id="env-btn-cancelar-${idx}" onclick="event.stopPropagation(); cancelarGrupoEnviado(${idx})" style="display:none">
                            ❌ Cancelar todo
                        </button>
                    </div>
                </div>

            </div>
        </div>`;
    }).join("");
}

function toggleModoEdicion(idx) {
    const th     = document.getElementById(`env-th-quitar-${idx}`);
    const btnEd  = document.getElementById(`env-btn-editar-${idx}`);
    const btnCan = document.getElementById(`env-btn-cancelar-${idx}`);
    const tbody  = document.getElementById(`env-tbody-${idx}`);
    if (!th || !btnEd || !btnCan || !tbody) return;

    const modoEdicion = !th.classList.contains("oculto");

    if (modoEdicion) {
        th.classList.add("oculto");
        tbody.querySelectorAll(".env-td-quitar").forEach(td => td.classList.add("oculto"));
        btnCan.style.display = "none";
        btnEd.textContent = "✏ Editar";
        btnEd.classList.remove("btn-editar-env-activo");
    } else {
        th.classList.remove("oculto");
        tbody.querySelectorAll(".env-td-quitar").forEach(td => td.classList.remove("oculto"));
        btnCan.style.display = "";
        btnEd.textContent = "✖ Cancelar edición";
        btnEd.classList.add("btn-editar-env-activo");
    }
}

function toggleEnvBloque(idx) {
    const detalle = document.getElementById(`env-detalle-${idx}`);
    const chevron = document.getElementById(`env-chevron-${idx}`);
    const bloque  = document.getElementById(`env-bloque-${idx}`);
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

async function quitarItemEnviado(idMov, idx) {
    const mensaje = document.getElementById(`env-mensaje-${idx}`);

    confirmarAccion("¿Querés quitar esta herramienta del envío?", async () => {
        const { error } = await supabaseClient
            .from("movimientos")
            .delete()
            .eq("id_mov", idMov)
            .eq("dni_origen", miDNI)
            .is("confirmado_destino", false);

        if (error) {
            mensaje.style.color = "red";
            mensaje.textContent = "Error: " + error.message;
            return;
        }

        document.getElementById(`env-fila-${idMov}`)?.remove();

        const tbody = document.getElementById(`env-tbody-${idx}`);
        if (!tbody || tbody.querySelectorAll("tr").length === 0) {
            mensaje.style.color = "green";
            mensaje.textContent = "✓ Envío cancelado completamente.";
            setTimeout(async () => {
                await cargarEnviados();
                await contarEnviados();
                await cargarMisHerramientas();
            }, 1200);
            return;
        }

        mensaje.style.color = "green";
        mensaje.textContent = "✓ Herramienta quitada del envío.";
        await contarEnviados();
        await cargarMisHerramientas();
        setTimeout(() => { mensaje.textContent = ""; }, 2500);
    });
}

async function cancelarGrupoEnviado(idx) {
    const g = window._envGrupos?.[idx];
    if (!g) return;
    confirmarAccion("¿Cancelás este envío completo? Las herramientas volverán a estar disponibles.", async () => {
        const mensaje = document.getElementById(`env-mensaje-${idx}`);
        mensaje.style.color = "gray";
        mensaje.textContent = "Cancelando...";

        const ids = g.items.map(i => i.id_mov);
        const { error } = await supabaseClient
            .from("movimientos")
            .delete()
            .in("id_mov", ids)
            .eq("dni_origen", miDNI)
            .is("confirmado_destino", false);

        if (error) {
            mensaje.style.color = "red";
            mensaje.textContent = "Error: " + error.message;
            return;
        }

        mensaje.style.color = "green";
        mensaje.textContent = "✓ Envío cancelado.";
        setTimeout(async () => {
            await cargarEnviados();
            await contarEnviados();
            await cargarMisHerramientas();
        }, 1200);
    });
}

// ─── PENDIENTES ───────────────────────────────────────────────────────────
async function contarPendientes() {
    const { data } = await supabaseClient
        .from("movimientos")
        .select("id_mov")
        .eq("dni_destino", miDNI)
        .is("confirmado_origen", true)
        .eq("estado", "pendiente");

    actualizarBadge("badgePendientes", data?.length || 0);
}

async function cargarPendientes() {
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select(`*, herramientas!fk_mov_herramienta(nombre, codigo, categoria, modelo, ubicacion, estado, trabajador_dni)`)
        .eq("dni_destino", miDNI)
        .is("confirmado_origen", true)
        .eq("estado", "pendiente")
        .order("fecha", { ascending: false });

    if (error) { console.error(error); return; }

    // Agrupar por dni_origen + minuto de fecha
    const grupos = {};
    data.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const key    = `${m.dni_origen}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = { key, dniOrigen: m.dni_origen, fecha: m.fecha, items: [] };
        }
        // Una herramienta está disponible para recibir si:
        // - Viene del almacén: debe estar en ubicacion "almacen" y estado "operativa"
        // - Viene de otro trabajador (transferencia): debe estar en "campo" asignada al dni_origen
        //   y su estado no puede ser "baja" ni "inoperativa"
        const esDeAlmacen = m.destino_tipo === "almacen" || !m.dni_origen ||
            (m.herramientas && m.herramientas.ubicacion === "almacen");
        const disponible = m.herramientas
            ? esDeAlmacen
                ? m.herramientas.ubicacion === "almacen" && m.herramientas.estado === "operativa"
                : m.herramientas.trabajador_dni === m.dni_origen &&
                  m.herramientas.estado !== "baja" && m.herramientas.estado !== "inoperativa"
            : false;
        grupos[key].items.push({
            id_mov:         m.id_mov,
            herramienta_id: m.herramienta_id,
            codigo:         m.herramientas?.codigo    || "—",
            nombre:         m.herramientas?.nombre    || "—",
            categoria:      m.herramientas?.categoria || "—",
            modelo:         m.herramientas?.modelo    || "—",
            estado:         m.herramientas?.estado    || "—",
            disponible
        });
    });

    // Traer datos de quienes envían
    const dnisPend = [...new Set(Object.values(grupos).map(g => g.dniOrigen).filter(Boolean))];
    let remitentes = {};
    if (dnisPend.length) {
        const { data: workers } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .in("DNI", dnisPend);
        if (workers) workers.forEach(w => { remitentes[w.DNI] = w; });
    }

    const listaGrupos = Object.values(grupos).map(g => ({ ...g, remitente: remitentes[g.dniOrigen] || null }));

    // ── GUARDAR EN VARIABLE GLOBAL para acceso desde botones inline ──
    window._pendGrupos = listaGrupos;

    // Reemplazar todo el contenido del tab directamente
    const tabPendientes = document.getElementById("tab-pendientes");
    const infoTabPend = tabPendientes.querySelector(".info-tab");
    tabPendientes.innerHTML = "";
    if (infoTabPend) tabPendientes.appendChild(infoTabPend.cloneNode(true));

    if (!listaGrupos.length) {
        const p = document.createElement("p");
        p.className = "cargando";
        p.style.cssText = "padding:30px;text-align:center";
        p.textContent = "No tenés movimientos pendientes.";
        tabPendientes.appendChild(p);
        return;
    }

    const pendLista = document.createElement("div");
    pendLista.className = "hist-lista";
    pendLista.id = "pendLista";
    tabPendientes.appendChild(pendLista);

    // ── Renderizar usando solo el ÍNDICE en los onclick (sin JSON inline) ──
    pendLista.innerHTML = listaGrupos.map((g, idx) => {
        const rem       = g.remitente;
        const nombreRem = rem ? `${rem.NOMBRE} ${rem.APELLIDOS}` : g.dniOrigen || "—";
        const total     = g.items.length;
        const noDisp    = g.items.filter(i => !i.disponible).length;
        const disp      = g.items.filter(i => i.disponible).length;

        const alertaStock = noDisp > 0
            ? `<span class="hist-tag hist-tag-alerta">⚠ ${noDisp} sin stock</span>`
            : "";

        return `
        <div class="hist-bloque" id="pend-bloque-${idx}">

            <!-- CABECERA -->
            <div class="hist-bloque-header" onclick="togglePendBloque(${idx})">
                <div class="hist-bloque-left">
                    <span class="hist-tag hist-tag-pendiente">⏳ Pendiente</span>
                    ${alertaStock}
                    <div class="hist-bloque-personas">
                        <span class="hist-persona-origen">${nombreRem}</span>
                        <span class="hist-flecha">→</span>
                        <span class="hist-persona-destino">Vos</span>
                    </div>
                </div>
                <div class="hist-bloque-right">
                    <span class="hist-bloque-count">${total} herramienta${total !== 1 ? "s" : ""}</span>
                    <span class="hist-bloque-fecha">${g.fecha ? formatearFecha(g.fecha) : "—"}</span>
                    <span class="hist-chevron" id="pend-chevron-${idx}">▼</span>
                </div>
            </div>

            <!-- DETALLE EXPANDIBLE -->
            <div class="hist-bloque-detalle oculto" id="pend-detalle-${idx}">

                <!-- INFO REMITENTE -->
                <div class="hist-personas-grid">
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📤 Enviado por</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniOrigen || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreRem}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${rem?.CARGO || "—"}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📅 Fecha</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Emisión</span><span>${g.fecha ? formatearFecha(g.fecha) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Disponibles</span><span>${disp} de ${total}</span></div>
                    </div>
                </div>

                ${noDisp > 0 ? `
                <div class="pend-aviso-stock">
                    ⚠ ${noDisp} herramienta${noDisp > 1 ? "s" : ""} no disponible${noDisp > 1 ? "s" : ""}. Solo se confirmarán las ${disp} disponibles.
                </div>` : ""}

                <!-- TABLA DE HERRAMIENTAS -->
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
                                <th>Disponible</th>
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
                                <td>${item.disponible
                                    ? "<span class='badge badge-operativa'>✓ Sí</span>"
                                    : "<span class='badge badge-inoperativa'>✗ No</span>"}</td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>

                <!-- ACCIONES -->
                <div class="pend-acciones" id="pend-acciones-${idx}">
                    <div class="pend-mensaje" id="pend-mensaje-${idx}"></div>
                    <div class="pend-botones" id="pend-botones-${idx}">
                        <button class="btn-rechazar"
                            onclick="event.stopPropagation(); rechazarGrupoInline(${idx})">
                            ❌ Rechazar todo
                        </button>
                        <button class="btn-confirmar"
                            id="pend-btn-conf-${idx}"
                            ${disp === 0 ? "disabled" : ""}
                            onclick="event.stopPropagation(); confirmarGrupoInline(${idx})">
                            ✅ Confirmar ${disp} herramienta${disp !== 1 ? "s" : ""}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join("");
}

function togglePendBloque(idx) {
    const detalle = document.getElementById(`pend-detalle-${idx}`);
    const chevron = document.getElementById(`pend-chevron-${idx}`);
    const bloque  = document.getElementById(`pend-bloque-${idx}`);

    if (!detalle || !chevron || !bloque) {
        console.warn(`togglePendBloque: elementos no encontrados para idx=${idx}`);
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

// ── CONFIRMAR GRUPO: ahora recibe solo el índice y lee desde _pendGrupos ──
async function confirmarGrupoInline(idx) {
    const g = window._pendGrupos?.[idx];
    if (!g) { console.error("confirmarGrupoInline: grupo no encontrado para idx", idx); return; }

    const disponibles = g.items.filter(i => i.disponible);
    const noDisp      = g.items.filter(i => !i.disponible);
    const mensaje     = document.getElementById(`pend-mensaje-${idx}`);
    const btnConf     = document.getElementById(`pend-btn-conf-${idx}`);

    if (!disponibles.length) {
        mensaje.style.color = "orange";
        mensaje.textContent = "No hay herramientas disponibles para confirmar.";
        return;
    }

    btnConf.disabled    = true;
    mensaje.style.color = "gray";
    mensaje.textContent = "Confirmando...";

    const errores = [];
    for (const item of disponibles) {
        try {
            const { data: result, error: fnErr } = await supabaseClient.functions.invoke("smart-endpoint", {
                body: {
                    id_mov:         item.id_mov,
                    herramienta_id: item.herramienta_id,
                    trabajador_dni: miDNI,
                    destino_tipo:   "persona"
                }
            });
            if (fnErr || result?.error) errores.push(item.nombre);
        } catch (err) {
            console.error("Error confirmando item:", item.nombre, err);
            errores.push(item.nombre);
        }
    }

    // Eliminar las que no estaban disponibles
    if (noDisp.length) {
        await supabaseClient.from("movimientos").delete()
            .in("id_mov", noDisp.map(i => i.id_mov));
    }

    if (errores.length) {
        mensaje.style.color = "orange";
        mensaje.textContent = `Errores al confirmar: ${errores.join(", ")}`;
        btnConf.disabled    = false;
        return;
    }

    mensaje.style.color = "green";
    mensaje.textContent = noDisp.length
        ? `✓ ${disponibles.length} confirmada${disponibles.length !== 1 ? "s" : ""}. ${noDisp.length} sin stock eliminada${noDisp.length !== 1 ? "s" : ""}.`
        : `✓ Todas confirmadas y ahora están a tu cargo.`;

    document.getElementById(`pend-botones-${idx}`)?.remove();
    setTimeout(async () => {
        await cargarMisHerramientas();
        await cargarPendientes();
        await contarPendientes();
    }, 1800);
}

// ── RECHAZAR GRUPO: ahora recibe solo el índice y lee desde _pendGrupos ──
async function rechazarGrupoInline(idx) {
    const g = window._pendGrupos?.[idx];
    if (!g) { console.error('rechazarGrupoInline: grupo no encontrado para idx', idx); return; }

    confirmarAccion('¿Rechazás este pedido completo? Quedará registrado en tu historial como rechazado.', async () => {
        const mensaje = document.getElementById(`pend-mensaje-${idx}`);
        const botones = document.getElementById(`pend-botones-${idx}`);

        mensaje.style.color = 'gray';
        mensaje.textContent = 'Rechazando...';
        if (botones) botones.style.display = 'none';

        const ids = g.items.map(i => i.id_mov);
        const { error } = await supabaseClient
            .from('movimientos')
            .update({ estado: 'rechazado', confirmado_destino: true, fecha_confirmacion: new Date().toISOString() })
            .in('id_mov', ids)
            .eq('dni_destino', miDNI);

        if (error) {
            mensaje.style.color = 'red';
            mensaje.textContent = 'Error: ' + error.message;
            if (botones) botones.style.display = '';
            return;
        }

        // Eliminar el bloque visualmente con animación
        const bloque = document.getElementById(`pend-bloque-${idx}`);
        if (bloque) {
            bloque.style.transition = 'opacity 0.3s';
            bloque.style.opacity    = '0';
            setTimeout(() => bloque.remove(), 300);
        }

        // Limpiar del array global
        window._pendGrupos[idx] = null;

        // Si no quedan grupos mostrar mensaje vacío
        const restantes = window._pendGrupos.filter(Boolean);
        if (!restantes.length) {
            const tabPendientes = document.getElementById('tab-pendientes');
            tabPendientes.innerHTML = '<p class="cargando" style="padding:30px;text-align:center">No tenés movimientos pendientes.</p>';
        }

        await contarPendientes();
    });
}

// ─── HISTORIAL EN BLOQUES ─────────────────────────────────────────────────
async function cargarHistorial() {
    const { data, error } = await supabaseClient
        .from("movimientos")
        .select("*, herramientas!fk_mov_herramienta(nombre, codigo, categoria, modelo, estado)")
        .or(`dni_origen.eq.${miDNI},dni_destino.eq.${miDNI}`)
        .is("confirmado_origen", true)
        .in("estado", ["confirmado", "rechazado"])
        .order("fecha", { ascending: false })
        .limit(200);

    if (error) { console.error(error); return; }

    const tabHistorial = document.getElementById("tab-historial");
    tabHistorial.innerHTML = "";

    if (!data || !data.length) {
        tabHistorial.innerHTML = `<p class="cargando" style="padding:30px;text-align:center">No hay movimientos registrados.</p>`;
        return;
    }

    const grupos = {};
    data.forEach(m => {
        const minuto = m.fecha ? m.fecha.slice(0, 16) : "sin-fecha";
        const key    = `${m.dni_origen || "almacen"}__${minuto}`;
        if (!grupos[key]) {
            grupos[key] = {
                key,
                dniOrigen:   m.dni_origen,
                dniDestino:  m.dni_destino,
                destinoTipo: m.destino_tipo,
                fecha:       m.fecha,
                fechaConf:   m.fecha_confirmacion,
                observacion: m.observacion,
                estado:      m.estado,
                items: []
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

    const dnis = [...new Set(
        Object.values(grupos).flatMap(g => [g.dniOrigen, g.dniDestino].filter(Boolean))
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

    const histLista = document.createElement("div");
    histLista.className = "hist-lista";
    histLista.id = "histLista";
    tabHistorial.appendChild(histLista);

    histLista.innerHTML = listaGrupos.map((g, idx) => {
        const origen  = g.dniOrigen  ? personas[g.dniOrigen]  : null;
        const destino = g.dniDestino ? personas[g.dniDestino] : null;

        const nombreOrigen  = origen
            ? `${origen.NOMBRE} ${origen.APELLIDOS}`
            : (g.dniOrigen ? g.dniOrigen : "Almacén");
        const nombreDestino = destino
            ? `${destino.NOMBRE} ${destino.APELLIDOS}`
            : (g.destinoTipo === "almacen" ? "🏭 Almacén" : g.dniDestino || "—");

        const esEnviado    = g.dniOrigen === miDNI;
        const esRechazado  = g.estado === "rechazado";
        const tagDireccion = esRechazado
            ? `<span class="hist-tag hist-tag-rechazado">❌ Rechazado</span>`
            : esEnviado
            ? `<span class="hist-tag hist-tag-enviado">📤 Enviado</span>`
            : `<span class="hist-tag hist-tag-recibido">📥 Recibido</span>`;

        const total = g.items.length;

        return `
        <div class="hist-bloque" id="hist-bloque-${idx}">

            <!-- CABECERA CLICKEABLE -->
            <div class="hist-bloque-header" onclick="toggleHistBloque(${idx})">
                <div class="hist-bloque-left">
                    ${tagDireccion}
                    <div class="hist-bloque-personas">
                        <span class="hist-persona-origen">${nombreOrigen}</span>
                        <span class="hist-flecha">→</span>
                        <span class="hist-persona-destino">${nombreDestino}</span>
                    </div>
                </div>
                <div class="hist-bloque-right">
                    <span class="hist-bloque-count">${total} herramienta${total !== 1 ? "s" : ""}</span>
                    <span class="hist-bloque-fecha">${g.fecha ? formatearFecha(g.fecha) : "—"}</span>
                    <span class="hist-chevron" id="hist-chevron-${idx}">▼</span>
                </div>
            </div>

            <!-- DETALLE EXPANDIBLE -->
            <div class="hist-bloque-detalle oculto" id="hist-detalle-${idx}">

                <!-- PERSONAS Y FECHAS -->
                <div class="hist-personas-grid">
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📤 Origen</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniOrigen || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreOrigen}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${origen?.CARGO || "—"}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📥 Destino</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">DNI</span><span>${g.dniDestino || "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Nombre</span><span>${nombreDestino}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Cargo</span><span>${destino?.CARGO || (g.destinoTipo === "almacen" ? "Almacenero" : "—")}</span></div>
                    </div>
                    <div class="hist-persona-card">
                        <div class="hist-persona-titulo">📅 Fechas y Obs.</div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Emisión</span><span>${g.fecha ? formatearFecha(g.fecha) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Confirmación</span><span>${g.fechaConf ? formatearFecha(g.fechaConf) : "—"}</span></div>
                        <div class="hist-persona-dato"><span class="hist-dato-label">Observación</span><span>${g.observacion || "—"}</span></div>
                    </div>
                </div>

                <!-- TABLA DE HERRAMIENTAS -->
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
                                <th>Detalle</th>
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
                                <td><button class="btn-detalle-mov" onclick="abrirDetalleMovimiento(${item.id_mov})">🔍 Ver</button></td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }).join("");
}

function toggleHistBloque(idx) {
    const detalle = document.getElementById(`hist-detalle-${idx}`);
    const chevron = document.getElementById(`hist-chevron-${idx}`);
    const bloque  = document.getElementById(`hist-bloque-${idx}`);

    if (!detalle || !chevron || !bloque) {
        console.warn(`toggleHistBloque: elementos no encontrados para idx=${idx}`);
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

// ─── DETALLE DE MOVIMIENTO ────────────────────────────────────────────────
async function abrirDetalleMovimiento(idMov) {
    const { data: m } = await supabaseClient
        .from("movimientos")
        .select("*, herramientas!fk_mov_herramienta(nombre, codigo)")
        .eq("id_mov", idMov)
        .single();

    if (!m) { alert("No se encontró el movimiento."); return; }

    document.getElementById("detMovCodigo").textContent      = m.herramientas?.codigo  || "—";
    document.getElementById("detMovNombre").textContent      = m.herramientas?.nombre  || "—";
    document.getElementById("detMovObservacion").textContent = m.observacion            || "—";
    document.getElementById("detMovFecha").textContent       = m.fecha ? formatearFecha(m.fecha) : "—";

    if (m.dni_origen) {
        const { data: origen } = await supabaseClient
            .from("trabajadores")
            .select("DNI, NOMBRE, APELLIDOS, CARGO")
            .eq("DNI", m.dni_origen)
            .single();

        document.getElementById("detOrigenDNI").textContent    = origen?.DNI                                    || m.dni_origen;
        document.getElementById("detOrigenNombre").textContent = origen ? `${origen.NOMBRE} ${origen.APELLIDOS}` : "—";
        document.getElementById("detOrigenCargo").textContent  = origen?.CARGO                                  || "—";
    } else {
        document.getElementById("detOrigenDNI").textContent    = "—";
        document.getElementById("detOrigenNombre").textContent = "Almacén";
        document.getElementById("detOrigenCargo").textContent  = "—";
    }

    if (m.destino_tipo === "almacen") {
        document.getElementById("detDestinoDNI").textContent    = m.dni_destino || "—";
        document.getElementById("detDestinoNombre").textContent = "Almacén";
        document.getElementById("detDestinoCargo").textContent  = "Almacenero";

        if (m.dni_destino) {
            const { data: destino } = await supabaseClient
                .from("trabajadores")
                .select("DNI, NOMBRE, APELLIDOS, CARGO")
                .eq("DNI", m.dni_destino)
                .single();

            if (destino) {
                document.getElementById("detDestinoDNI").textContent    = destino.DNI;
                document.getElementById("detDestinoNombre").textContent = `${destino.NOMBRE} ${destino.APELLIDOS}`;
                document.getElementById("detDestinoCargo").textContent  = destino.CARGO || "—";
            }
        }
    } else {
        if (m.dni_destino) {
            const { data: destino } = await supabaseClient
                .from("trabajadores")
                .select("DNI, NOMBRE, APELLIDOS, CARGO")
                .eq("DNI", m.dni_destino)
                .single();

            document.getElementById("detDestinoDNI").textContent    = destino?.DNI                                     || m.dni_destino;
            document.getElementById("detDestinoNombre").textContent = destino ? `${destino.NOMBRE} ${destino.APELLIDOS}` : "—";
            document.getElementById("detDestinoCargo").textContent  = destino?.CARGO                                    || "—";
        } else {
            document.getElementById("detDestinoDNI").textContent    = "—";
            document.getElementById("detDestinoNombre").textContent = "—";
            document.getElementById("detDestinoCargo").textContent  = "—";
        }
    }

    abrirModal("modalDetalleMov");
}

// ─── INICIO ───────────────────────────────────────────────────────────────
verificarCuentaActiva(usuarioLocal);
iniciar();