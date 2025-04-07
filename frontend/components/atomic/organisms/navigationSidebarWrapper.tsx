import { currentUser } from "@clerk/nextjs/server";
import { NavigationSidebar } from "@/components/atomic/organisms/navigationSidebar";

export async function NavigationSidebarWrapper() {
  const user = await currentUser();

  // Don't render if no user
  if (!user) return null;

  // Map Clerk user data to your component's expected format
  const userData = {
    name: `${user.fullName}`,
    email: user.emailAddresses[0]?.emailAddress || "",
    avatar: user.imageUrl || "",
  };

  // Pass the data to your client component
  return <NavigationSidebar user={userData} />;
}
