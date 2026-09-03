import { createRouter, createWebHashHistory } from "vue-router";
import { isAuthenticated, ensureProfile } from "@/lib/auth";
import AppLayout from "@/components/layout/AppLayout.vue";

const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { public: true }
  },
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", redirect: "/dashboard" },
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("@/views/DashboardView.vue"),
        meta: { requiresAuth: true }
      },
      {
        path: "equipe",
        name: "equipe",
        component: () => import("@/views/EquipeView.vue"),
        meta: { requiresAuth: true, editOnly: true }
      },
      {
        path: "filiais",
        name: "filiais",
        component: () => import("@/views/FiliaisView.vue"),
        meta: { requiresAuth: true, editOnly: true }
      },
      {
        path: "departamentos",
        name: "departamentos",
        component: () => import("@/views/DepartamentosView.vue"),
        meta: { requiresAuth: true, editOnly: true }
      },
      {
        path: "usuarios",
        name: "usuarios",
        component: () => import("@/views/UsuariosView.vue"),
        meta: { requiresAuth: true, adminOnly: true }
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard"
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

/* Guardas de acesso por perfil:
   - login -> sem sessão volta para o dashboard
   - internas -> sem sessão válida vai para o login
   - visitante -> só dashboard
   - usuarios -> só admin

   Rotas restritas (adminOnly/editOnly) revalidam o perfil no servidor
   (ensureProfile) antes de liberar: não confiam apenas no perfil salvo no
   cliente, que pode estar desatualizado (ex.: usuário rebaixado no banco).
   A autorização real de dados é RLS no Postgres — este guard é apenas UX. */
router.beforeEach(async (to) => {
  if (to.meta.public) {
    if (isAuthenticated()) return { name: "dashboard" };
    return true;
  }
  if (to.meta.requiresAuth) {
    if (!isAuthenticated()) return { name: "login", query: { redirect: to.fullPath } };
    if (to.meta.adminOnly || to.meta.editOnly) {
      const profile = await ensureProfile();
      if (!isAuthenticated()) return { name: "login" };
      if (profile) {
        if (to.meta.adminOnly && profile.perfil !== "admin") return { name: "dashboard" };
        if (to.meta.editOnly && profile.perfil === "visitante") return { name: "dashboard" };
      }
    }
  }
  return true;
});

export default router;
