// Esperar a que Supabase resuelva la sesión antes de ejecutar cualquier lógica
supabaseClient.auth.onAuthStateChange((event, session) => {
    // Solo actuar en SIGNED_IN o TOKEN_REFRESHED — ignorar otros eventos
    if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION") return;

    // Registrar el listener del form una sola vez
    const form = document.getElementById("formCambio");
    if (form.dataset.listenerActivo) return;
    form.dataset.listenerActivo = "true";

    form.addEventListener("submit", async function(e) {
        e.preventDefault();

        const nueva     = document.getElementById("nuevaPassword").value.trim();
        const confirmar = document.getElementById("confirmarPassword").value.trim();
        const mensaje   = document.getElementById("mensaje");

        if (nueva.length < 8) {
            mensaje.style.color = "red";
            mensaje.innerText = "La contraseña debe tener al menos 8 caracteres.";
            return;
        }
        if (!/[A-Z]/.test(nueva)) {
            mensaje.style.color = "red";
            mensaje.innerText = "La contraseña debe tener al menos una mayúscula.";
            return;
        }
        if (!/[0-9]/.test(nueva)) {
            mensaje.style.color = "red";
            mensaje.innerText = "La contraseña debe tener al menos un número.";
            return;
        }
        if (nueva !== confirmar) {
            mensaje.style.color = "red";
            mensaje.innerText = "Las contraseñas no coinciden.";
            return;
        }

        if (!session) {
            mensaje.style.color = "red";
            mensaje.innerText = "Sesión expirada. Por favor volvé a iniciar sesión.";
            setTimeout(() => window.location.href = "index.html", 2000);
            return;
        }

        mensaje.style.color = "gray";
        mensaje.innerText = "Guardando...";

        try {
            // 1. Cambiar contraseña en Auth
            const { error: authError } = await supabaseClient.auth.updateUser({ password: nueva });
            if (authError) {
                mensaje.style.color = "red";
                mensaje.innerText = "Error al actualizar: " + authError.message;
                return;
            }

            // 2. Obtener DNI del usuario activo
            const user = session.user;
            const usuarioLocal = JSON.parse(localStorage.getItem("usuario") || "{}");
            let dni = usuarioLocal.DNI || null;

            const { data: trab } = await supabaseClient
                .from("trabajadores")
                .select("DNI")
                .eq("EMAIL", user.email)
                .single();
            if (trab?.DNI) dni = trab.DNI;

            if (dni) {
                // 3. Limpiar temp_pass en la tabla (solo temp_pass, sin temp_password que no existe)
                const { error: dbError } = await supabaseClient
                    .from("trabajadores")
                    .update({ temp_pass: null })
                    .eq("DNI", dni);
                console.log("DNI usado:", dni);
    console.log("Limpieza temp_pass:", dbError ? "ERROR: " + dbError.message : "OK");
                if (dbError) console.error("Error limpiando temp_pass:", dbError);

                // 4. Refrescar localStorage desde BD
                const { data: fresco } = await supabaseClient
                    .from("trabajadores")
                    .select("*")
                    .eq("DNI", dni)
                    .single();

                if (fresco) {
                    localStorage.setItem("usuario", JSON.stringify(fresco));
                }
            }

            // 5. Garantía final: forzar limpieza en localStorage
            const uLocal = JSON.parse(localStorage.getItem("usuario") || "{}");
            uLocal.temp_pass = null;
            localStorage.setItem("usuario", JSON.stringify(uLocal));

            mensaje.style.color = "green";
            mensaje.innerText = "✓ Contraseña actualizada correctamente. Redirigiendo...";
            setTimeout(() => window.location.href = "dashboard.html", 1500);

        } catch (err) {
            mensaje.style.color = "red";
            mensaje.innerText = "Error de conexión con el servidor.";
            console.error(err);
        }
    });
});