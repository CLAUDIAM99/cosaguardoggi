// Chiave API TMDB (gratuita): https://www.themoviedb.org/settings/api
window.MOVIE_PICKER_CONFIG = {
  tmdbApiKey: "",

  // Opzionale: login e film salvati sul cloud (Firebase).
  // Console: https://console.firebase.google.com → crea progetto → Authentication (Email)
  // → Firestore → Deploy regole da firestore.rules (`firebase deploy --only firestore:rules`)
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: ""
    // storageBucket: "" // opzionale
  }
};
