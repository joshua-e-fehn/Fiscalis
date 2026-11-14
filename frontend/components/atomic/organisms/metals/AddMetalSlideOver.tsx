"use client";

import { useState, useMemo } from "react";
import { customItemPremiums } from "@/convex/lib/metalPremiums";
import { resolvePremiums } from "@/../services/finance/metals";

/** Parse a percent field ("2.5" → 0.025); empty/invalid → fallback (decimal). */
function percentOrDefault(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n / 100 : fallback;
}
import { useQuery, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
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
import { CurrencySelect } from "@/components/atomic/atoms/currencySelect";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { MetalsType } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { todayLocalISO } from "@/lib/utils/date";
import { Search, Loader2, Package, Plus } from "lucide-react";

const METALS: MetalsType[] = ["gold", "silver", "platinum", "palladium"];
const METAL_EMOJI: Record<MetalsType, string> = {
  gold: "🥇",
  silver: "🥈",
  platinum: "⚪",
  palladium: "⬜",
};
const ITEM_CATEGORIES = ["coin", "bar", "jewelry", "scrap"] as const;

/** A premium as a signed percentage with one decimal: "+2.5%", "-1.0%" */
const signedPremium = (decimal: number) =>
  `${decimal >= 0 ? "+" : ""}${(decimal * 100).toFixed(1)}%`;

interface AddMetalSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "catalog" | "custom";
  onModeChange: (mode: "catalog" | "custom") => void;
  onSuccess?: () => void;
}

export function AddMetalSlideOver({
  isOpen,
  onClose,
  mode,
  onModeChange,
  onSuccess,
}: AddMetalSlideOverProps) {
  const t = useTranslations("metals");
  const tActions = useTranslations("common.actions");
  // Catalog state
  const [searchQuery, setSearchQuery] = useState("");
  const [metalFilter, setMetalFilter] = useState<MetalsType | "all">("all");
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<Id<"metalCatalog"> | null>(null);

  // Form state (shared between catalog and custom)
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  // The purchase currency as an ISO code; until the user picks one it
  // follows the display currency (null), which may still be loading
  const display = useDisplayCurrency();
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const purchaseCurrency = chosenCurrency ?? display.code;
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");

  // Custom item state
  const [customName, setCustomName] = useState("");
  const [customMetal, setCustomMetal] = useState<MetalsType>("gold");
  const [customCategory, setCustomCategory] =
    useState<(typeof ITEM_CATEGORIES)[number]>("coin");
  const [customPurity, setCustomPurity] = useState("999");
  const [customWeight, setCustomWeight] = useState("");
  // Premium fields stay empty until the user types; empty = calibrated default
  // for the chosen metal/category (convex/lib/metalPremiums.ts).
  const [customBuyPremium, setCustomBuyPremium] = useState("");
  const [customSellPremium, setCustomSellPremium] = useState("");
  const customDefaults = customItemPremiums(customMetal, customCategory);

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
  // The catalog defaults the server applies (vault.addVaultItemFromCatalog)
  const selectedPremiums =
    selectedItem &&
    resolvePremiums({
      buy: [
        selectedItem.defaultBuyPremium,
        (selectedItem as { defaultPremium?: number }).defaultPremium,
      ],
      sell: [selectedItem.defaultSellPremium],
    });

  // Reset form
  const resetForm = () => {
    setQuantity("1");
    setPurchasePrice("");
    setPurchaseDate("");
    setChosenCurrency(null);
    setStorageLocation("");
    setNotes("");
    setSelectedCatalogItem(null);
    setCustomName("");
    setCustomMetal("gold");
    setCustomCategory("coin");
    setCustomPurity("999");
    setCustomWeight("");
    setCustomBuyPremium("");
    setCustomSellPremium("");
    setSearchQuery("");
  };

  // Handle submit
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (mode === "catalog" && selectedCatalogItem) {
        await addFromCatalog({
          catalogItemId: selectedCatalogItem,
          quantity: parseInt(quantity) || 1,
          purchasePricePerUnit: purchasePrice
            ? parseFloat(purchasePrice)
            : undefined,
          purchaseDate,
          purchaseCurrency,
          storageLocation: storageLocation || undefined,
          notes: notes || undefined,
        });
      } else if (mode === "custom") {
        await addCustom({
          customName,
          metalType: customMetal,
          category: customCategory,
          purity: parseFloat(customPurity) || 999,
          weightGrams: parseFloat(customWeight) || 0,
          quantity: parseInt(quantity) || 1,
          buyPremium: percentOrDefault(customBuyPremium, customDefaults.buy),
          sellPremium: percentOrDefault(customSellPremium, customDefaults.sell),
          purchasePricePerUnit: purchasePrice
            ? parseFloat(purchasePrice)
            : undefined,
          purchaseDate,
          purchaseCurrency,
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

  // The purchase date dates the item's opening transaction: without it the
  // item would count as held since before every range (D3), so a new entry
  // must give it. A negative price is never valid.
  const priceValid = purchasePrice === "" || parseFloat(purchasePrice) >= 0;
  const canSubmit =
    !!purchaseDate &&
    priceValid &&
    (mode === "catalog"
      ? !!selectedCatalogItem && parseInt(quantity) > 0
      : !!customName && parseFloat(customWeight) > 0 && parseInt(quantity) > 0);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("add.title")}</SheetTitle>
          <SheetDescription>{t("add.description")}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => onModeChange(v as "catalog" | "custom")}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="catalog">
              <Package className="h-4 w-4 mr-2" />
              {t("add.fromCatalog")}
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Plus className="h-4 w-4 mr-2" />
              {t("add.customItem")}
            </TabsTrigger>
          </TabsList>

          {/* Catalog Tab */}
          <TabsContent value="catalog" className="space-y-4 mt-4">
            {/* Search & Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("add.searchPlaceholder")}
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
                  <SelectItem value="all">{t("add.allMetals")}</SelectItem>
                  {METALS.map((metal) => (
                    <SelectItem key={metal} value={metal}>
                      {METAL_EMOJI[metal]} {t(`metal.${metal}`)}
                    </SelectItem>
                  ))}
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
                  {t("add.noItems")}
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
                        {item.mint
                          ? t("add.catalogLineWithMint", {
                              weight: item.fineWeightOz.toFixed(2),
                              purity: item.purity,
                              mint: item.mint,
                            })
                          : t("add.catalogLine", {
                              weight: item.fineWeightOz.toFixed(2),
                              purity: item.purity,
                            })}
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
                  {t("add.selectedLine", {
                    weight: selectedItem.weightGrams,
                    purity: selectedItem.purity,
                    buy: signedPremium(selectedPremiums!.buyPremium),
                    sell: signedPremium(selectedPremiums!.sellPremium),
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Custom Item Tab */}
          <TabsContent value="custom" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="customName">{t("add.name")}</Label>
                <Input
                  id="customName"
                  placeholder={t("add.namePlaceholder")}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("add.metalType")}</Label>
                  <Select
                    value={customMetal}
                    onValueChange={(v) => setCustomMetal(v as MetalsType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METALS.map((metal) => (
                        <SelectItem key={metal} value={metal}>
                          {METAL_EMOJI[metal]} {t(`metal.${metal}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("add.category")}</Label>
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
                      {ITEM_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {t(`itemCategory.${category}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="customWeight">{t("add.weight")}</Label>
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
                  <Label htmlFor="customPurity">{t("add.purity")}</Label>
                  <Input
                    id="customPurity"
                    type="number"
                    placeholder="999"
                    value={customPurity}
                    onChange={(e) => setCustomPurity(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("add.purityHint")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="customBuyPremium">{t("add.buyPremium")}</Label>
                  <Input
                    id="customBuyPremium"
                    type="number"
                    step="0.1"
                    placeholder={(customDefaults.buy * 100).toFixed(1)}
                    value={customBuyPremium}
                    onChange={(e) => setCustomBuyPremium(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("add.buyPremiumHint")}
                  </p>
                </div>
                <div>
                  <Label htmlFor="customSellPremium">{t("add.sellPremium")}</Label>
                  <Input
                    id="customSellPremium"
                    type="number"
                    step="0.1"
                    placeholder={(customDefaults.sell * 100).toFixed(1)}
                    value={customSellPremium}
                    onChange={(e) => setCustomSellPremium(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("add.sellPremiumHint")}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Common Fields */}
        <div className="space-y-4 mt-6 pt-6 border-t">
          <h4 className="font-medium text-sm">{t("add.purchaseDetails")}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">{t("add.quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="purchasePrice">{t("add.pricePerUnit")}</Label>
              <Input
                id="purchasePrice"
                type="number"
                step="0.01"
                placeholder={t("add.optional")}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("add.currency")}</Label>
              <CurrencySelect
                value={purchaseCurrency}
                onValueChange={setChosenCurrency}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="purchaseDate">{t("add.purchaseDate")}</Label>
            <Input
              id="purchaseDate"
              type="date"
              required
              max={todayLocalISO()}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("add.purchaseDateHint")}
            </p>
          </div>

          <div>
            <Label htmlFor="storageLocation">{t("add.storageLocation")}</Label>
            <Input
              id="storageLocation"
              placeholder={t("add.storagePlaceholder")}
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="notes">{t("add.notes")}</Label>
            <Textarea
              id="notes"
              placeholder={t("add.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {tActions("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("add.submit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
