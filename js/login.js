document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const dni               = document.getElementById("dni").value.trim();
    const passwordIngresado = document.getElementById("password").value.trim();
    const mensaje           = document.getElementById("mensaje");

    mensaje.style.color = "gray";
    mensaje.innerText   = "Verificando...";

    try {
        // 0. Cerrar sesión previa
        await supabaseClient.auth.signOut();

        // 1. Buscar trabajador por DNI
        const { data: trabajador, error } = await supabaseClient
            .from("trabajadores")
            .select("*")
            .eq("DNI", dni)
            .single();

        if (error || !trabajador) {
            mensaje.style.color = "red";
            mensaje.innerText   = "Usuario no encontrado.";
            return;
        }

        // 2. Verificar cuenta activa
        const estaActivo = trabajador.ESTADO === true || trabajador.ESTADO === "true";
        if (!estaActivo) {
            mensaje.style.color = "red";
            mensaje.innerText   = "Tu cuenta está desactivada. Contactá al administrador.";
            return;
        }

        // 3. Login en Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email:    trabajador.EMAIL,
            password: passwordIngresado
        });

        if (authError) {
            mensaje.style.color = "red";
            mensaje.innerText   = "Contraseña incorrecta.";
            return;
        }

        // 4. Guardar en localStorage
        localStorage.setItem("usuario", JSON.stringify(trabajador));

        // 5. Verificar si tiene temp_pass con valor
        const tieneTempPass = trabajador.temp_pass !== null
            && trabajador.temp_pass !== undefined
            && trabajador.temp_pass !== "";

        if (!tieneTempPass) {
            // Sin temp_pass → ir al dashboard directamente
            mensaje.style.color = "green";
            mensaje.innerText   = "Acceso correcto. Redirigiendo...";
            setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
            return;
        }

        // 6. Tiene temp_pass — comparar con la contraseña ingresada
        //    Si ingresó una contraseña DISTINTA al temp_pass → ya la cambió antes
        //    pero el update a la BD falló. Limpiamos ahora y lo dejamos pasar.
        const usandoTempPass = passwordIngresado === trabajador.temp_pass;

        if (!usandoTempPass) {
            // La contraseña ya fue cambiada — limpiar temp_pass en BD
            await supabaseClient
                .from("trabajadores")
                .update({ temp_pass: null })
                .eq("DNI", dni);

            // Actualizar localStorage
            trabajador.temp_pass = null;
            localStorage.setItem("usuario", JSON.stringify(trabajador));

            mensaje.style.color = "green";
            mensaje.innerText   = "Acceso correcto. Redirigiendo...";
            setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
        } else {
            // Está usando la contraseña temporal → limpiar temp_pass y forzar cambio
            await supabaseClient
                .from("trabajadores")
                .update({ temp_pass: null })
                .eq("DNI", dni);

            // Actualizar localStorage
            trabajador.temp_pass = null;
            localStorage.setItem("usuario", JSON.stringify(trabajador));

            mensaje.style.color = "green";
            mensaje.innerText   = "Primer acceso detectado. Redirigiendo...";
            setTimeout(() => { window.location.href = "cambio_contraseña.html"; }, 1000);
        }

    } catch (err) {
        mensaje.style.color = "red";
        mensaje.innerText   = "Error conectando con el servidor.";
        console.error(err);
    }
});