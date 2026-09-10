/**
 * js/config.js
 * -------------------------------------------------------
 * Seule information publique nécessaire au frontend : l'URL de TA
 * fonction Vercel. Aucune clé secrète, aucune URL Google ici :
 * c'est justement tout l'intérêt de la passerelle sécurisée.
 *
 * Remplace la valeur ci-dessous par l'URL réelle de ton déploiement
 * Vercel une fois en ligne, par exemple :
 *   "https://nexi-one.vercel.app/api/execute-script"
 */
window.NEXI_CONFIG = {
  API_URL: 'https://nexi-academy-one.vercel.app/',
  // Intervalle (ms) entre deux synchronisations automatiques en arrière-plan.
  AUTO_SYNC_INTERVAL: 20000
};
