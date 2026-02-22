import { Button, Input, Textarea } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";

export default function ProfilePage() {
  return (
    <PageContainer
      title="Profile"
      description="Manage your account information"
    >
      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-muted border border-border flex items-center justify-center">
            <span className="text-4xl font-medium text-muted-foreground">
              U
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-medium text-foreground">User</h3>
            <p className="text-muted-foreground mt-1">user@example.com</p>
            <p className="text-sm text-muted-foreground mt-2">
              Member since November 2025
            </p>
          </div>
          <Button
            variant="outline"
            className="px-5 py-2.5 rounded-xl border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Change Avatar
          </Button>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <h3 className="text-lg font-medium mb-6 text-foreground">
          Account Details
        </h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Display Name
            </label>
            <Input
              type="text"
              defaultValue="User"
              className="w-full h-auto px-4 py-3 rounded-xl border border-border bg-card text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Email Address
            </label>
            <Input
              type="email"
              defaultValue="user@example.com"
              className="w-full h-auto px-4 py-3 rounded-xl border border-border bg-card text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Bio
            </label>
            <Textarea
              rows={3}
              placeholder="Tell us about yourself..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/20 transition-all resize-none"
            />
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <Button className="px-6 py-3 h-auto rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
            Save Changes
          </Button>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <h3 className="text-lg font-medium mb-6 text-foreground">
          Usage Statistics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Total Memories</p>
            <p className="text-2xl font-semibold text-foreground mt-1">128</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">API Requests</p>
            <p className="text-2xl font-semibold text-foreground mt-1">1,284</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Storage Used</p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              24.5 MB
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
