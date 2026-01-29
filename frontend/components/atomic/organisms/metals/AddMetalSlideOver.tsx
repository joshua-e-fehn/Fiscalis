"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { MetalBadge, MetalIcon } from "@/components/atomic/atoms/metals";
import { MetalsType, MetalsCurrency } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { Search, Loader2, Package, Plus } from "lucide-react";

interface AddMetalSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  mode: "catalog" | "custom";
  onModeChange: (mode: "catalog" | "custom") => void;
  onSuccess?: () => void;
}

export function AddMetalSlideOver({
  isOpen,
  onClose,
  userId,
  mode,
  onModeChange,
  onSuccess,
}: AddMetalSlideOverProps) {
  // Catalog state
  const [searchQuery, setSearchQuery] = useState("");
  const [metalFilter, setMetalFilter] = useState<MetalsType | "all">("all");
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<Id<"metalCatalog"> | null>(null);

  // Form state (shared between catalog and custom)
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<MetalsCurrency>("eur");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");

  // Custom item state
  const [customName, setCustomName] = useState("");
  const [customMetal, setCustomMetal] = useState<MetalsType>("gold");
  const [customCategory, setCustomCategory] = useState<
    "coin" | "bar" | "jewelry" | "scrap"
  >("coin");
  const [customPurity, setCustomPurity] = useState("999");
  const [customWeight, setCustomWeight] = useState("");
  const [customBuyPremium, setCustomBuyPremium] = useState("3"); // Default 3% buy premium
  const [customSellPremium, setCustomSellPremium] = useState("-2"); // Default -2% sell premium

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch catalog
  const catalog = useQuery(api.vault.getMetalCatalog, {
    metalType: metalFilter === "all" ? undefined : metalFilter,
  });

  // Mutations
  const addFromCatalog = useMutation(api.vault.addVaultItemFromCatalog);
  const addCustom = useMutation(api.vault.addCustomVaultItem);

  // Filter and sort catalog items
  const filteredCatalog = useMemo(() => {
    if (!catalog) return [];

    let result = [...catalog];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.mint?.toLowerCase().includes(query) ||
          item.country?.toLowerCase().includes(query),
      );
    }

    // Sort: popular first, then coins before bars, then by name
    result.sort((a, b) => {
      // Popular items first
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      // Coins before bars
      if (a.category === "coin" && b.category === "bar") return -1;
      if (a.category === "bar" && b.category === "coin") return 1;
      // Then by name
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [catalog, searchQuery]);

  // Get selected catalog item details
  const selectedItem = useMemo(() => {
    if (!selectedCatalogItem || !catalog) return null;
    return catalog.find((item) => item._id === selectedCatalogItem);
  }, [selectedCatalogItem, catalog]);

  // Reset form
  const resetForm = () => {
    setQuantity("1");
    setPurchasePrice("");
    setPurchaseDate("");
    setPurchaseCurrency("eur");
    setStorageLocation("");
    setNotes("");
    setSelectedCatalogItem(null);
    setCustomName("");
    setCustomMetal("gold");
    setCustomCategory("coin");
    setCustomPurity("999");
    setCustomWeight("");
    setCustomBuyPremium("3");
    setCustomSellPremium("-2");
    setSearchQuery("");
  };

  // Handle submit
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (mode === "catalog" && selectedCatalogItem) {
        await addFromCatalog({
          userId,
          catalogItemId: selectedCatalogItem,
          quantity: parseInt(quantity) || 1,
          purchasePricePerUnit: purchasePrice
            ? parseFloat(purchasePrice)
            : undefined,
          purchaseDate: purchaseDate || undefined,
          purchaseCurrency: purchaseCurrency.toUpperCase(),
          storageLocation: storageLocation || undefined,
          notes: notes || undefined,
        });
      } else if (mode === "custom") {
        await addCustom({
          userId,
          customName,
          metalType: customMetal,
          category: customCategory,
          purity: parseFloat(customPurity) || 999,
          weightGrams: parseFloat(customWeight) || 0,
          quantity: parseInt(quantity) || 1,
          buyPremium: (parseFloat(customBuyPremium) || 3) / 100, // Convert % to decimal
          sellPremium: (parseFloat(customSellPremium) || -2) / 100, // Convert % to decimal
          purchasePricePerUnit: purchasePrice
            ? parseFloat(purchasePrice)
            : undefined,
          purchaseDate: purchaseDate || undefined,
          purchaseCurrency: purchaseCurrency.toUpperCase(),
          storageLocation: storageLocation || undefined,
          notes: notes || undefined,
        });
      }

      resetForm();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to add item:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    mode === "catalog"
      ? !!selectedCatalogItem && parseInt(quantity) > 0
      : !!customName && parseFloat(customWeight) > 0 && parseInt(quantity) > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add to Vault</SheetTitle>
          <SheetDescription>
            Add precious metals to your inventory from the catalog or create a
            custom entry.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => onModeChange(v as "catalog" | "custom")}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="catalog">
              <Package className="h-4 w-4 mr-2" />
              From Catalog
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Plus className="h-4 w-4 mr-2" />
              Custom Item
            </TabsTrigger>
          </TabsList>

          {/* Catalog Tab */}
          <TabsContent value="catalog" className="space-y-4 mt-4">
            {/* Search & Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search coins, bars..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={metalFilter}
                onValueChange={(v) => setMetalFilter(v as MetalsType | "all")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="gold">🥇 Gold</SelectItem>
                  <SelectItem value="silver">🥈 Silver</SelectItem>
                  <SelectItem value="platinum">⚪ Platinum</SelectItem>
                  <SelectItem value="palladium">⬜ Palladium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Catalog Grid */}
            <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
              {!catalog && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {catalog && filteredCatalog.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No items found
                </div>
              )}
              {filteredCatalog.map((item) => (
                <Card
                  key={item._id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedCatalogItem === item._id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => setSelectedCatalogItem(item._id)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <MetalIcon metal={item.metalType as MetalsType} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.fineWeightOz.toFixed(2)} oz · {item.purity}‰
                        {item.mint && ` · ${item.mint}`}
                      </div>
                    </div>
                    <MetalBadge
                      metal={item.metalType as MetalsType}
                      size="sm"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Selected Item Summary */}
            {selectedItem && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="font-medium">{selectedItem.name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedItem.weightGrams}g · {selectedItem.purity}‰ · Buy +
                  {(
                    (selectedItem.defaultBuyPremium ??
                      (selectedItem as any).defaultPremium ??
                      0.03) * 100
                  ).toFixed(0)}
                  % / Sell{" "}
                  {(selectedItem.defaultSellPremium ?? 0) >= 0 ? "+" : ""}
                  {((selectedItem.defaultSellPremium ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </TabsContent>

          {/* Custom Item Tab */}
          <TabsContent value="custom" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="customName">Name *</Label>
                <Input
                  id="customName"
                  placeholder="e.g., Grandma's wedding ring"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Metal Type *</Label>
                  <Select
                    value={customMetal}
                    onValueChange={(v) => setCustomMetal(v as MetalsType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold">🥇 Gold</SelectItem>
                      <SelectItem value="silver">🥈 Silver</SelectItem>
                      <SelectItem value="platinum">⚪ Platinum</SelectItem>
                      <SelectItem value="palladium">⬜ Palladium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category *</Label>
                  <Select
                    value={customCategory}
                    onValueChange={(v) =>
                      setCustomCategory(v as typeof customCategory)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coin">Coin</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="jewelry">Jewelry</SelectItem>
                      <SelectItem value="scrap">Scrap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="customWeight">Weight (grams) *</Label>
                  <Input
                    id="customWeight"
                    type="number"
                    step="0.01"
                    placeholder="31.1"
                    value={customWeight}
                    onChange={(e) => setCustomWeight(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="customPurity">Purity (‰) *</Label>
                  <Input
                    id="customPurity"
                    type="number"
                    placeholder="999"
                    value={customPurity}
                    onChange={(e) => setCustomPurity(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    e.g., 999, 916.7, 750, 585
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="customBuyPremium">Buy Premium (%)</Label>
                  <Input
                    id="customBuyPremium"
                    type="number"
                    step="0.1"
                    placeholder="3"
                    value={customBuyPremium}
                    onChange={(e) => setCustomBuyPremium(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Above spot when buying
                  </p>
                </div>
                <div>
                  <Label htmlFor="customSellPremium">Sell Premium (%)</Label>
                  <Input
                    id="customSellPremium"
                    type="number"
                    step="0.1"
                    placeholder="-2"
                    value={customSellPremium}
                    onChange={(e) => setCustomSellPremium(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Negative = below spot
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Common Fields */}
        <div className="space-y-4 mt-6 pt-6 border-t">
          <h4 className="font-medium text-sm">Purchase Details</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="purchasePrice">Price per Unit</Label>
              <Input
                id="purchasePrice"
                type="number"
                step="0.01"
                placeholder="Optional"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Select
                value={purchaseCurrency}
                onValueChange={(v) => setPurchaseCurrency(v as MetalsCurrency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eur">€ EUR</SelectItem>
                  <SelectItem value="usd">$ USD</SelectItem>
                  <SelectItem value="chf">₣ CHF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="purchaseDate">Purchase Date</Label>
            <Input
              id="purchaseDate"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="storageLocation">Storage Location</Label>
            <Input
              id="storageLocation"
              placeholder="e.g., Home safe, Bank deposit box"
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add to Vault
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
