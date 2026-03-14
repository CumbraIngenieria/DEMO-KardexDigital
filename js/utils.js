// ============================================================
//  utils.js — Funciones compartidas para todos los paneles
//  Requiere: supabaseClient.js cargado antes que este archivo
// ============================================================

// ─── SESIÓN ───────────────────────────────────────────────────────────────

/**
 * Devuelve el usuario del localStorage o redirige al login si no existe.
 * Uso: const usuario = obtenerUsuario();
 */
function obtenerUsuario() {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    if (!usuario) { window.location.href = "index.html"; return null; }
    return usuario;
}

/**
 * Verifica en la BD que la cuenta del usuario sigue activa.
 * Si fue desactivada cierra la sesión y redirige al login.
 * Llamar al inicio de cada panel después de obtenerUsuario().
 */
async function verificarCuentaActiva(usuario) {
    if (!usuario) return;

    const { data, error } = await supabaseClient
        .from("trabajadores")
        .select("ESTADO")
        .eq("DNI", usuario.DNI)
        .single();

    if (error || !data) return; // si hay error de red no expulsamos

    const estaActivo = data.ESTADO === true || data.ESTADO === "true";
    if (!estaActivo) {
        await supabaseClient.auth.signOut();
        localStorage.removeItem("usuario");
        window.location.href = "index.html";
    }
}

/**
 * Verifica que el rol del usuario esté entre los roles permitidos.
 * Si no, redirige al dashboard.
 * @param {number[]} rolesPermitidos - Ej: [1, 3]
 * @param {number} rol
 */
function verificarRol(rolesPermitidos, rol) {
    if (!rolesPermitidos.includes(Number(rol))) {
        window.location.href = "dashboard.html";
    }
}

/**
 * Cierra la sesión con confirmación y redirige al login.
 */
function cerrarSesion() {
    confirmarAccion("¿Estás seguro que querés cerrar sesión?", async () => {
        await supabaseClient.auth.signOut();
        localStorage.removeItem("usuario");
        window.location.href = "index.html";
    });
}


// ─── MODALES ──────────────────────────────────────────────────────────────

/**
 * Abre un modal por su ID y muestra el overlay.
 * @param {string} id
 */
function abrirModal(id) {
    document.getElementById(id).classList.remove("oculto");
    document.getElementById("overlay").classList.remove("oculto");
}

/**
 * Cierra un modal por su ID y oculta el overlay.
 * @param {string} id
 */
function cerrarModal(id) {
    document.getElementById(id).classList.add("oculto");
    document.getElementById("overlay").classList.add("oculto");
}

/**
 * Cierra todos los modales abiertos y oculta el overlay.
 */
function cerrarTodosModales() {
    document.querySelectorAll(".modal").forEach(m => m.classList.add("oculto"));
    document.getElementById("overlay").classList.add("oculto");
}


// ─── TABS ─────────────────────────────────────────────────────────────────

/**
 * Cambia el tab activo.
 * @param {string} id           - ID del tab sin el prefijo "tab-" (ej: "stock")
 * @param {HTMLElement} btn     - Botón que fue clickeado
 * @param {Object} [callbacks]  - Objeto con callbacks opcionales: { stock: fn, solicitudes: fn, ... }
 *
 * Uso:
 *   mostrarTab('stock', this, { solicitudes: cargarSolicitudes, historial: cargarHistorial })
 */
function mostrarTab(id, btn, callbacks = {}) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("activo"));
    document.getElementById("tab-" + id).classList.add("active");
    btn.classList.add("activo");
    if (callbacks[id]) callbacks[id]();
}


// ─── BADGES ───────────────────────────────────────────────────────────────

/**
 * Actualiza un badge de notificación numérica.
 * @param {string} badgeId  - ID del elemento badge
 * @param {number} count    - Cantidad a mostrar (0 oculta el badge)
 */
function actualizarBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove("oculto");
    } else {
        badge.classList.add("oculto");
    }
}


// ─── BADGES DE ESTADO ─────────────────────────────────────────────────────

const BADGE_ESTADO = {
    operativa:     "badge-operativa",
    inoperativa:   "badge-inoperativa",
    mantenimiento: "badge-mantenimiento",
    baja:          "badge-baja",
};

/**
 * Devuelve el HTML de un badge de estado de herramienta.
 * @param {string} estado
 * @returns {string}
 */
function badgeEstado(estado) {
    const clase = BADGE_ESTADO[estado] || "badge-inoperativa";
    return `<span class="badge ${clase}">${estado || "—"}</span>`;
}

/**
 * Devuelve el HTML de un badge de ubicación.
 * @param {string} ubicacion - "almacen" | "campo"
 * @returns {string}
 */
function badgeUbicacion(ubicacion) {
    return ubicacion === "almacen"
        ? `<span class="badge badge-almacen">🏭 Almacén</span>`
        : `<span class="badge badge-campo">👤 Campo</span>`;
}


// ─── EXPORTAR CSV ─────────────────────────────────────────────────────────

/**
 * Genera y descarga un archivo CSV a partir de un array de filas.
 * @param {Array[]} filas       - Primera fila = cabeceras
 * @param {string} nombreArchivo - Sin extensión, se agrega la fecha automáticamente
 *
 * Uso:
 *   exportarCSV([["Col1","Col2"],["val1","val2"]], "inventario")
 */
function exportarCSV(filas, nombreArchivo) {
    const csv  = filas.map(f => f.map(v => `"${String(v).replace(/"/g, "'")}"`)
                                  .join(";"))
                       .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}


// ─── PREVIEW DE TRABAJADOR POR DNI ────────────────────────────────────────

/**
 * Escucha el input de un campo DNI y muestra el nombre del trabajador en un elemento.
 * @param {string} inputId    - ID del input de DNI
 * @param {string} previewId  - ID del elemento donde mostrar el nombre
 * @param {number} [minLen=6] - Longitud mínima del DNI para buscar
 */
function activarPreviewDNI(inputId, previewId, minLen = 6) {
    document.getElementById(inputId).addEventListener("input", async function () {
        const dni     = this.value.trim();
        const preview = document.getElementById(previewId);
        if (dni.length < minLen) { preview.textContent = "—"; return; }

        const { data } = await supabaseClient
            .from("trabajadores")
            .select("NOMBRE, APELLIDOS")
            .eq("DNI", dni)
            .single();

        preview.textContent = data
            ? `${data.NOMBRE} ${data.APELLIDOS}`
            : "Trabajador no encontrado";
    });
}

// ─── FORMATEAR ID ─────────────────────────────────────────────────────────

/**
 * Formatea un número como ID con ceros a la izquierda.
 * @param {number} numero - El ID a formatear
 * @returns {string} - Ej: 1 → "00001"
 */
function formatearID(numero) {
    return String(numero).padStart(5, '0');
}

// ─── FORMATEAR FECHA A HORA PERÚ ─────────────────────────────────────────

/**
 * Formatea una fecha UTC a formato legible en zona horaria de Lima, Perú.
 * @param {string} fechaUTC
 * @returns {string} - Ej: "11/03/2026 14:35"
 */
function formatearFecha(fechaUTC) {
    if (!fechaUTC) return "—";

    const fecha = new Date(fechaUTC);

    return fecha.toLocaleString("es-PE", {
        timeZone: "America/Lima",
        year:     "numeric",
        month:    "2-digit",
        day:      "2-digit",
        hour:     "2-digit",
        minute:   "2-digit",
        hour12:   false
    });
}


// ─── MODAL DE CONFIRMACIÓN GLOBAL ────────────────────────────────────────

/**
 * Muestra un modal de confirmación reutilizable.
 * @param {string}   mensaje    - Texto a mostrar en el modal
 * @param {Function} onAceptar  - Callback async ejecutado al aceptar
 * @param {Function} onCancelar - Callback opcional ejecutado al cancelar
 */
function confirmarAccion(mensaje, onAceptar, onCancelar = null) {
    let modal = document.getElementById("modalConfirmGlobal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modalConfirmGlobal";
        modal.innerHTML = `
            <div class="confirm-overlay" id="confirmOverlay"></div>
            <div class="confirm-box">
                <p class="confirm-mensaje" id="confirmMensaje"></p>
                <div class="confirm-botones">
                    <button class="confirm-btn-cancelar" id="confirmCancelar">Cancelar</button>
                    <button class="confirm-btn-aceptar" id="confirmAceptar">Aceptar</button>
                </div>
            </div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            #modalConfirmGlobal {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 9999;
                align-items: center;
                justify-content: center;
            }
            #modalConfirmGlobal.visible {
                display: flex;
            }
            .confirm-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.45);
                backdrop-filter: blur(2px);
            }
            .confirm-box {
                position: relative;
                z-index: 10000;
                background: white;
                border-radius: 16px;
                padding: 28px 30px 22px;
                max-width: 380px;
                width: 90%;
                box-shadow: 0 12px 40px rgba(0,0,0,0.18);
                animation: confirmFadeIn 0.2s ease;
                font-family: 'DM Sans', Arial, sans-serif;
            }
            @keyframes confirmFadeIn {
                from { opacity: 0; transform: scale(0.93) translateY(10px); }
                to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            .confirm-mensaje {
                font-size: 0.98rem;
                color: #2d3a5a;
                line-height: 1.55;
                margin: 0 0 22px;
                text-align: center;
            }
            .confirm-botones {
                display: flex;
                gap: 10px;
                justify-content: center;
            }
            .confirm-btn-cancelar {
                flex: 1;
                padding: 10px;
                border-radius: 10px;
                border: 1.5px solid #e0e6f0;
                background: white;
                color: #5a6a8a;
                font-size: 0.9rem;
                font-weight: 600;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s;
            }
            .confirm-btn-cancelar:hover { background: #f5f7fb; }
            .confirm-btn-aceptar {
                flex: 1;
                padding: 10px;
                border-radius: 10px;
                border: none;
                background: linear-gradient(135deg, #4f7cff, #3461d1);
                color: white;
                font-size: 0.9rem;
                font-weight: 700;
                cursor: pointer;
                font-family: inherit;
                transition: opacity 0.15s;
            }
            .confirm-btn-aceptar:hover { opacity: 0.88; }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
    }

    document.getElementById("confirmMensaje").textContent = mensaje;
    modal.classList.add("visible");

    const btnAceptar  = document.getElementById("confirmAceptar");
    const btnCancelar = document.getElementById("confirmCancelar");
    const overlay     = document.getElementById("confirmOverlay");

    // Limpiar listeners anteriores clonando los botones
    const newAceptar  = btnAceptar.cloneNode(true);
    const newCancelar = btnCancelar.cloneNode(true);
    btnAceptar.parentNode.replaceChild(newAceptar, btnAceptar);
    btnCancelar.parentNode.replaceChild(newCancelar, btnCancelar);

    function cerrar() { modal.classList.remove("visible"); }

    document.getElementById("confirmAceptar").addEventListener("click", async () => {
        cerrar();
        if (onAceptar) await onAceptar();
    });

    document.getElementById("confirmCancelar").addEventListener("click", () => {
        cerrar();
        if (onCancelar) onCancelar();
    });

    overlay.onclick = () => {
        cerrar();
        if (onCancelar) onCancelar();
    };
}