// constants.js
// Constantes y configuración global del sistema Kardex Digital.
// Debe cargarse ANTES que cualquier otro JS del proyecto.
// ─────────────────────────────────────────────────────────────

// ─── ROLES ────────────────────────────────────────────────────────────────
// Mapeo de ID de rol a nombre legible.
const ROLES = {
    1: "Técnico",
    2: "Supervisor",
    3: "Almacenero",
    4: "Trabajador",
};

// ─── MÓDULOS DEL SISTEMA ──────────────────────────────────────────────────
// Definición de cada sección: título, ícono y descripción para el dashboard.
const MODULOS = {
    "mi-registro": { titulo: "Mi Registro",       icon: "📋", desc: "Herramientas a mi cargo"      },
    "almacen":     { titulo: "Almacén",            icon: "🏭", desc: "Stock disponible en almacén"  },
    "gestion":     { titulo: "Gestión de Almacén", icon: "📦", desc: "Control de Stock"  },
    "busqueda":    { titulo: "Búsqueda Avanzada",  icon: "🔍", desc: "Buscar cualquier herramienta" },
    "admin":       { titulo: "Administración",     icon: "⚙️", desc: "Panel de administración"      },
};

// ─── MÓDULOS VISIBLES POR ROL ─────────────────────────────────────────────
// Qué secciones puede ver cada rol en el dashboard.
const MODULOS_POR_ROL = {
    1: ["mi-registro", "almacen", "gestion", "busqueda", "admin"],
    2: ["mi-registro", "almacen", "busqueda"],
    3: ["gestion", "busqueda"],
    4: ["mi-registro", "almacen"],
};

// ─── REDIRECCIONES POR MÓDULO Y ROL ──────────────────────────────────────
// Devuelve el HTML de destino según el módulo clickeado y el rol del usuario.
function obtenerRedireccion(id, rol) {
    if (id === "admin")        return "admin.html";
    if (id === "gestion")      return "panel-almacen.html";
    if (id === "almacen")      return "panel-stock.html";
    if (id === "busqueda")     return "panel-busqueda.html";
    if (id === "mi-registro")  return "panel-mi-registro.html";
    return null;
}