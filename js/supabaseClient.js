const { createClient } = supabase;

const SUPABASE_URL = "https://lcqpetvtgulehmqdoshb.supabase.co";

// Usar la legacy anon key (eyJ...) que copiaste de "Legacy anon, service_role API keys"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcXBldHZ0Z3VsZWhtcWRvc2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTcxMzQsImV4cCI6MjA4NjczMzEzNH0.zRyCaykHbyNcvVLI29apUAhQ-JkptIGW6fCjzm8_yq0";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Verificar que la conexión funciona
supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
        console.error("Error conectando con Supabase:", error.message);
    } else {
        console.log("Supabase conectado correctamente");
    }
});

