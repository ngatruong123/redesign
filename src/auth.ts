import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      const allowed = process.env.ALLOWED_EMAILS?.split(",").map((e) => e.trim()) ?? [];
      if (allowed.length === 0) return true;
      return allowed.includes(profile?.email ?? "");
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
