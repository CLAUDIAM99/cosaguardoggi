// Chiave API TMDB (gratuita): https://www.themoviedb.org/settings/api
window.MOVIE_PICKER_CONFIG = {
  tmdbApiKey: "",

  // Opzionale: login e film salvati sul cloud (Firebase).
  // Console: https://console.firebase.google.com → crea progetto → Authentication (Email)
  // → Firestore → Deploy regole da firestore.rules (`firebase deploy --only firestore:rules`)
  firebase: {
    // Copia apiKey da Console → Impostazioni progetto → app web → Configurazione (oggetto firebaseConfig).
    apiKey: "",
    authDomain: "staseracosaguard.firebaseapp.com",
    projectId: "staseracosaguard",
    appId: "1:103787235061:web:532ca118d3120fdf2867bc"
    // storageBucket: "" // opzionale: staseracosaguard.appspot.com
  }
};
