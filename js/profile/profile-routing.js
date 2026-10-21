/* ============================================================================
   PEGASUS — Profile Ecosystem Layer · profile-routing.js
   Resolves which profile to show and whether the viewer owns it.
   Exposes: window.PegProfileRoute
   ============================================================================ */
(function () {
  'use strict';

  /* Parse the current URL for slug/id. Supports:
       /profile.html                      -> own profile
       /public-profile.html?slug=foo      -> public by slug
       /public-profile.html?id=uuid       -> public by id
       /u/foo  (rewritten by netlify to ?slug=foo) */
  function parse() {
    var params = new URLSearchParams(location.search);
    var slug = params.get('slug');
    var id = params.get('id');
    // /u/{slug} path support if the host serves it raw
    if (!slug && !id) {
      var m = location.pathname.match(/^\/(?:(?:ar|zh|ru|es|fr)\/)?u\/([^\/?#]+)/);
      if (m) slug = decodeURIComponent(m[1]);
    }
    return { slug: slug, id: id };
  }

  /* Resolve the profile to render + whether the viewer is the owner. */
  async function resolve(mode) {
    var P = window.PegProfile;
    var route = parse();

    // OWN profile page: always the signed-in user's profile
    if (mode === 'own') {
      var own = P.ownProfile();
      var usr = P.currentUser();
      return {
        profile: own,
        isOwner: !!usr,
        signedIn: !!usr,
        viewerId: usr ? usr.id : null,
      };
    }

    // PUBLIC profile page: look up by slug or id
    var prof = (route.slug || route.id) ? await P.loadProfile(route) : null;
    var usr2 = P.currentUser();
    var isOwner = !!(usr2 && prof && usr2.id === prof.id);
    return {
      profile: prof,
      isOwner: isOwner,
      signedIn: !!usr2,
      viewerId: usr2 ? usr2.id : null,
      notFound: !prof && !!(route.slug || route.id),
      noTarget: !route.slug && !route.id,
    };
  }

  window.PegProfileRoute = { parse: parse, resolve: resolve };
})();
