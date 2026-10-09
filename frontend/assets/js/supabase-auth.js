(()=>{
 let client;
 function getClient(){
  const cfg=window.VG_CONFIG||{};
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase URL and publishable key are not configured.');
  if(!window.supabase?.createClient)throw new Error('Supabase client library did not load. Check your network connection.');
  if(!client)client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'vaccineguard-auth'}});
  return client;
 }
 async function getRole(user){if(!user?.id)return null;const {data,error}=await getClient().from('profiles').select('role').eq('id',user.id).maybeSingle();if(error)throw error;return ['admin','user','checkpoint'].includes(data?.role)?data.role:null}
 window.VGAuth={
  client:getClient,
  signIn:(email,password)=>getClient().auth.signInWithPassword({email,password}),
  signOut:()=>getClient().auth.signOut(),
  session:async()=>{const {data,error}=await getClient().auth.getSession();if(error)throw error;return data.session},
  getAccessToken:async()=>{const s=await window.VGAuth.session();return s?.access_token||null},
  getRole,
  requireSession:async()=>{const session=await window.VGAuth.session();if(!session){location.replace('login.html');return null}let role;try{role=await getRole(session.user)}catch(error){throw new Error('Could not verify your account role. Apply the Supabase migration and sign in again.')}if(!role){await window.VGAuth.signOut();location.replace('login.html?error=role');return null}return {session,user:session.user,role}},
  requestPasswordReset:(email,redirectTo)=>getClient().auth.resetPasswordForEmail(email,{redirectTo}),
  updatePassword:password=>getClient().auth.updateUser({password}),
  onChange:callback=>getClient().auth.onAuthStateChange(callback)
 };
})();
