import { createRouter, createWebHashHistory } from "vue-router";
import { isAuthenticated, ensureProfile } from "@/lib/auth";
import AppLayout from "@/components/layout/AppLayout.vue";

const views = {
  login: () => import("@/views/LoginView.vue"),
  dashboard: () => import("@/views/DashboardView.vue"),
  filiais: () => import("@/views/FiliaisView.vue"),
  usuarios: () => import("@/views/UsuariosView.vue"),
  rescisoes: () => import("@/views/RescisoesView.vue"),
  treinamentos: () => import("@/views/TreinamentosView.vue"),
  vagas: () => import("@/views/VagasView.vue"),
  absenteismo: () => import("@/views/AbsenteismoView.vue")
};

const routes = [
  {
    path: "/login",
    name: "login",
    component: views.login,
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
        component: views.dashboard,
        meta: { requiresAuth: true }
      },
      {
        path: "filiais",
        name: "filiais",
        component: views.filiais,
        meta: { requiresAuth: true }
      },
      {
        path: "rescisoes",
        name: "rescisoes",
        component: views.rescisoes,
        meta: { requiresAuth: true }
      },
      {
        path: "treinamentos",
        name: "treinamentos",
        component: views.treinamentos,
        meta: { requiresAuth: true }
      },
      {
        path: "vagas",
        name: "vagas",
        component: views.vagas,
        meta: { requiresAuth: true }
      },
      {
        path: "absenteismo",
        name: "absenteismo",
        component: views.absenteismo,
        meta: { requiresAuth: true }
      },
      {
        path: "usuarios",
        name: "usuarios",
        component: views.usuarios,
        meta: { requiresAuth: true, adminOnly: true }
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard"
  }
];

export function prefetchRoutes() {
  const run = () => {
    Object.values(views).forEach((load) => {
      try {
        load().catch(() => {});
      } catch {
      }
    });
  };
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}


const router = createRouter({ history: createWebHashHistory(), routes });

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
