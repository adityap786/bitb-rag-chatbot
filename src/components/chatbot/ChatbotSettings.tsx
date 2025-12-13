"use client";

import { useState } from "react";
import { X, Upload, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatbotConfig } from "@/types/chatbot";
import { Separator } from "@/components/ui/separator";

interface ChatbotSettingsProps {
  config: ChatbotConfig;
  onConfigChange: (config: ChatbotConfig) => void;
  onClose: () => void;
}

export const ChatbotSettings = ({ config, onConfigChange, onClose }: ChatbotSettingsProps) => {
  const [localConfig, setLocalConfig] = useState<ChatbotConfig>(config);
  const [newUrl, setNewUrl] = useState("");

  const handleSave = () => {
    onConfigChange(localConfig);
    onClose();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalConfig({ ...localConfig, logo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddUrl = () => {
    if (newUrl.trim()) {
      setLocalConfig({
        ...localConfig,
        indexedUrls: [...(localConfig.indexedUrls || []), newUrl.trim()],
      });
      setNewUrl("");
    }
  };

  const handleRemoveUrl = (index: number) => {
    setLocalConfig({
      ...localConfig,
      indexedUrls: (localConfig.indexedUrls || []).filter((_, i) => i !== index),
    });
  };

  return (
    <div className="mb-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-[450px] max-h-[600px] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="font-semibold text-lg">Chatbot Settings</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <Tabs defaultValue="branding" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="branding">Brand</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
            </TabsList>

            {/* Branding Tab */}
            <TabsContent value="branding" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logo">Logo</Label>
                <div className="flex items-center gap-2">
                  {localConfig.logo && (
                    <img
                      src={localConfig.logo}
                      alt="Logo preview"
                      className="w-12 h-12 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-800"
                    />
                  )}
                  <Input
                    id="logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assistantName">Assistant Name</Label>
                <Input
                  id="assistantName"
                  value={localConfig.assistantName}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, assistantName: e.target.value })
                  }
                  placeholder="AI Assistant"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandColor">Brand Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="brandColor"
                    type="color"
                    value={localConfig.brandColor}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, brandColor: e.target.value })
                    }
                    className="w-20 h-10"
                  />
                  <Input
                    value={localConfig.brandColor}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, brandColor: e.target.value })
                    }
                    placeholder="#6366f1"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fontFamily">Font Family</Label>
                <Select
                  name="fontFamily"
                  value={localConfig.fontFamily}
                  onValueChange={(value) =>
                    setLocalConfig({ ...localConfig, fontFamily: value })
                  }
                >
                  <SelectTrigger id="fontFamily">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system-ui">System UI</SelectItem>
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                    <SelectItem value="'Open Sans', sans-serif">Open Sans</SelectItem>
                    <SelectItem value="'Poppins', sans-serif">Poppins</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  name="theme"
                  value={localConfig.theme}
                  onValueChange={(value: "light" | "dark" | "auto") =>
                    setLocalConfig({ ...localConfig, theme: value })
                  }
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="layout">Layout</Label>
                <Select
                  name="layout"
                  value={localConfig.layout}
                  onValueChange={(value: "compact" | "standard" | "expanded") =>
                    setLocalConfig({ ...localConfig, layout: value })
                  }
                >
                  <SelectTrigger id="layout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="expanded">Expanded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Select
                  value={localConfig.position}
                  onValueChange={(value: any) =>
                    setLocalConfig({ ...localConfig, position: value })
                  }
                >
                  <SelectTrigger id="position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <Select
                  value={localConfig.tone}
                  onValueChange={(value: any) =>
                    setLocalConfig({ ...localConfig, tone: value })
                  }
                >
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={localConfig.language}
                  onValueChange={(value: any) =>
                    setLocalConfig({ ...localConfig, language: value })
                  }
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिंदी (Hindi)</SelectItem>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallbackMessage">Fallback Message</Label>
                <Textarea
                  id="fallbackMessage"
                  value={localConfig.fallbackMessage}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, fallbackMessage: e.target.value })
                  }
                  placeholder="Message when bot can't answer"
                  rows={3}
                />
              </div>
            </TabsContent>

            {/* Features Tab */}
            <TabsContent value="features" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Suggested Replies</Label>
                  <p className="text-xs text-muted-foreground">
                    Show quick reply suggestions
                  </p>
                </div>
                <Switch
                  checked={localConfig.enableSuggestedReplies}
                  onCheckedChange={(checked) =>
                    setLocalConfig({ ...localConfig, enableSuggestedReplies: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Human Handover</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow transfer to human support
                  </p>
                </div>
                <Switch
                  checked={localConfig.enableHumanHandover}
                  onCheckedChange={(checked) =>
                    setLocalConfig({ ...localConfig, enableHumanHandover: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Site Search</Label>
                  <p className="text-xs text-muted-foreground">
                    In-widget site search
                  </p>
                </div>
                <Switch
                  checked={localConfig.enableSiteSearch}
                  onCheckedChange={(checked) =>
                    setLocalConfig({ ...localConfig, enableSiteSearch: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Feedback Collection</Label>
                  <p className="text-xs text-muted-foreground">
                    Collect ratings & feedback
                  </p>
                </div>
                <Switch
                  checked={localConfig.enableFeedback}
                  onCheckedChange={(checked) =>
                    setLocalConfig({ ...localConfig, enableFeedback: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Transcript Export</Label>
                  <p className="text-xs text-muted-foreground">
                    Download & share chat history
                  </p>
                </div>
                <Switch
                  checked={localConfig.enableTranscriptExport}
                  onCheckedChange={(checked) =>
                    setLocalConfig({ ...localConfig, enableTranscriptExport: checked })
                  }
                />
              </div>
            </TabsContent>

            {/* Data Tab */}
            <TabsContent value="data" className="space-y-4">
              <div className="space-y-2">
                <Label>Website URLs to Index</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Add URLs to crawl for chatbot knowledge
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/page"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddUrl();
                      }
                    }}
                  />
                  <Button onClick={handleAddUrl} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 mt-3">
                  {(localConfig.indexedUrls || []).map((url, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                    >
                      <span className="text-sm truncate flex-1">{url}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleRemoveUrl(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {(localConfig.indexedUrls || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No URLs added yet
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="documents">Upload Documents (PDF)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload PDFs for knowledge base
                </p>
                <Input
                  id="documents"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  onChange={(e) => {
                    // Handle document upload
                    console.log("Documents:", e.target.files);
                  }}
                />
                {(localConfig.uploadedDocuments || []).length > 0 && (
                  <div className="space-y-2 mt-3">
                    {(localConfig.uploadedDocuments || []).map((doc, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                      >
                        <span className="text-sm truncate flex-1">{doc}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  );
};
