// dashboard.js
// Depende de: supabaseClient.js, utils.js

const usuarioLocal = obtenerUsuario();

// MODULOS, MODULOS_POR_ROL y obtenerRedireccion viven en constants.js

// ─── CARGAR DATOS FRESCOS DESDE SUPABASE ──────────────────────────────────
async function cargarDatos() {
    const { data: trabajador, error } = await supabaseClient
        .from("trabajadores")
        .select("*")
        .eq("DNI", usuarioLocal.DNI)
        .single();

    if (error || !trabajador) { window.location.href = "index.html"; return; }

    localStorage.setItem("usuario", JSON.stringify(trabajador));

    const nombre    = trabajador.NOMBRE    || "";
    const apellidos = trabajador.APELLIDOS || "";
    const cargo     = trabajador.CARGO     || "";
    const rol       = trabajador["ID ROL"] || trabajador.id_rol || 4;
    const esActivo  = trabajador.ESTADO === true || trabajador.ESTADO === "true";

    document.getElementById("nombreCompleto").textContent = `${nombre} ${apellidos}`.trim() || "Sin nombre";
    document.getElementById("cargoHeader").textContent    = cargo || "Sin cargo";
    document.getElementById("avatarInicial").textContent  = nombre ? nombre[0].toUpperCase() : "?";
    document.getElementById("datoDNI").textContent        = trabajador.DNI || "—";
    document.getElementById("datoNombre").textContent     = nombre         || "—";
    document.getElementById("datoApellidos").textContent  = apellidos      || "—";
    document.getElementById("datoCargo").textContent      = cargo          || "—";

    const badgeEstado = document.getElementById("datoEstado");
    badgeEstado.textContent = esActivo ? "Activo" : "Inactivo";
    badgeEstado.className   = `badge-estado ${esActivo ? "activo" : "inactivo"}`;

    generarModulos(rol);
}

// ─── GENERAR BOTONES DE MÓDULOS ───────────────────────────────────────────
function generarModulos(rol) {
    const modulos = MODULOS_POR_ROL[rol] || MODULOS_POR_ROL[4];
    const grid    = document.getElementById("gridOpciones");
    grid.innerHTML = "";

    modulos.forEach((id, index) => {
        const mod         = MODULOS[id];
        const redireccion = obtenerRedireccion(id, rol);
        const btn         = document.createElement("button");

        btn.className = `opcion-btn${index === 0 ? " activo" : ""}`;
        btn.onclick   = redireccion
            ? () => { window.location.href = redireccion; }
            : () => { mostrarSeccion(id, btn); };

        btn.innerHTML = `
            <span class="opcion-icon">${mod.icon}</span>
            <span class="opcion-titulo">${mod.titulo}</span>
            <span class="opcion-desc">${mod.desc}</span>
        `;
        grid.appendChild(btn);
    });
}

function mostrarSeccion(id, btn) {
    document.querySelectorAll(".seccion-contenido").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".opcion-btn").forEach(b => b.classList.remove("activo"));
    document.getElementById("sec-" + id)?.classList.add("active");
    btn.classList.add("activo");
}

// ─── INICIO ───────────────────────────────────────────────────────────────
verificarCuentaActiva(usuarioLocal);
cargarDatos();