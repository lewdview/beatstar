console.log(Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('KEY') || k.includes('PASS') || k.includes('URL') || k.includes('DB') || k.includes('PORT')));
