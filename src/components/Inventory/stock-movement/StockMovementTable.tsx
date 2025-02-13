'use client'

import { useState, useEffect } from "react"
import { Button } from "@/components/Shared/ui/button"
import { Input } from "@/components/Shared/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/Shared/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Shared/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Shared/ui/card"
import { Checkbox } from "@/components/Shared/ui/checkbox"
import Pagination from "@/components/Shared/ui/pagination"
import { Search, FileDown, Plus, Pencil, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/Shared/ui/dialog"
import { Label } from "@/components/Shared/ui/label"
import { Textarea } from "@/components/Shared/ui/textarea"
import { StockMovement, StockMovementResponse } from "@/types/inventory"
import { useToast } from "@/components/Shared/ui/use-toast"
import { safeIpcInvoke } from "@/lib/ipc"
import { useAppTranslation } from '@/hooks/use-translation'

export function StockMovementTable({ inventoryId }: { inventoryId: string }) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [dateRange, setDateRange] = useState<[Date, Date]>([new Date(), new Date()])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [showPhysicalCount, setShowPhysicalCount] = useState(false)
  const [physicalCounts, setPhysicalCounts] = useState<{[key: string]: number}>({})
  const { toast } = useToast()
  const { t } = useAppTranslation()

  useEffect(() => {
    fetchMovements();
  }, [currentPage, dateRange, selectedProducts]);

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const response = await safeIpcInvoke<StockMovementResponse>(
        'stock-movement:get-all',
        {
          inventoryId,
          startDate: dateRange[0],
          endDate: dateRange[1],
          productId: selectedProducts.length === 1 ? selectedProducts[0] : undefined,
          page: currentPage,
          limit: 10
        },
        { success: false }
      );

      if (response?.success && response.movements) {
        setMovements(response.movements);
        setTotalPages(response.pages || 1);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: response?.message || "Failed to fetch movements"
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch stock movements"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhysicalCount = async (productId: string, count: number) => {
    try {
      const systemCount = movements.find(m => m.productId === productId)?.quantity || 0;
      
      const response = await safeIpcInvoke<{ success: boolean; message?: string }>(
        'stock-movement:create-adjustment',
        {
          data: {
            productId,
            inventory_id: inventoryId,
            physical_count: count,
            system_count: systemCount,
            reason: 'Physical count adjustment',
            performedBy_id: 'current-user-id' // Replace with actual user ID
          }
        },
        { success: false }
      );

      if (response?.success) {
        toast({
          title: "Success",
          description: "Stock adjustment recorded successfully"
        });
        fetchMovements();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: response?.message || "Failed to record adjustment"
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process physical count"
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMovements, setSelectedMovements] = useState<string[]>([])
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [movementType, setMovementType] = useState<"Inbound" | "Outbound">("Inbound")
  const itemsPerPage = 10

  const filteredMovements = movements.filter(movement =>
    Object.values(movement).some(value => 
      value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const pageCount = Math.ceil(filteredMovements.length / itemsPerPage)
  const paginatedMovements = filteredMovements.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const toggleMovementSelection = (movementId: string) => {
    setSelectedMovements(prevSelected =>
      prevSelected.includes(movementId)
        ? prevSelected.filter(id => id !== movementId)
        : [...prevSelected, movementId]
    )
  }

  const toggleAllMovements = () => {
    setSelectedMovements(
      selectedMovements.length === paginatedMovements.length
        ? []
        : paginatedMovements.map(m => m.id)
    )
  }

  const openOverlay = (movement: StockMovement) => {
    setSelectedMovement(movement);
  }

  const closeOverlay = () => {
    setSelectedMovement(null);
  }

  const handleAddMovement = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const costPerUnit = Number(formData.get('cost_per_unit')) || 0;
    const quantity = Number(formData.get('quantity'));

    const newMovement: StockMovement = {
      id: (movements.length + 1).toString(),
      movementType: formData.get('type') as StockMovement['movementType'],
      quantity,
      date: formData.get('date') as string,
      reason: formData.get('reason') as string,
      destination: movementType === 'Outbound' ? formData.get('destination') as string : undefined,
      performedBy_id: formData.get('performedBy') as string,
      productId: 'default-product-id',
      direction: movementType === 'Outbound' ? 'outbound' : 'inbound',
      source_inventory_id: inventoryId,
      cost_per_unit: costPerUnit,
      total_cost: quantity * costPerUnit,
      createdAt: new Date(),
    }
    setMovements([...movements, newMovement])
    setShowAddForm(false)
  }

  const handleMovementTypeChange = (value: "Inbound" | "Outbound") => {
    setMovementType(value);
  };

  const exportToPDF = async () => {
    // Implementation using a PDF library like jsPDF
  };

  if (showAddForm) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">{t('inventory.stockMovement.addMovement')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMovement} className="space-y-4">
              <div>
                <Label htmlFor="type">Movement Type</Label>
                <Select name="type">
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Added">Added</SelectItem>
                    <SelectItem value="Sold">Sold</SelectItem>
                    <SelectItem value="Returned">Returned</SelectItem>
                    <SelectItem value="Adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input type="number" name="quantity" required />
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input type="date" name="date" required />
              </div>
              <div>
                <Label htmlFor="movementType">Inbound/Outbound</Label>
                <Select 
                  name="movementType" 
                  onValueChange={(value: string) => handleMovementTypeChange(value as "Inbound" | "Outbound")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select movement type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inbound">Inbound</SelectItem>
                    <SelectItem value="Outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {movementType === 'Outbound' && (
                <div>
                  <Label htmlFor="destination">Destination</Label>
                  <Select name="destination">
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Warehouse A">Warehouse A</SelectItem>
                      <SelectItem value="Warehouse B">Warehouse B</SelectItem>
                      <SelectItem value="Main Store">Main Store</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="reason">Reason</Label>
                <Textarea name="reason" required />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>{t('common.actions.cancel')}</Button>
                <Button type="submit">{t('common.actions.save')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t('inventory.stockMovement.title')}</CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline">
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Movemant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center py-4">
            <Select>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Movements</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ml-2"
            />
            <Button variant="ghost" className="ml-2">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedMovements.length === paginatedMovements.length}
                      onCheckedChange={toggleAllMovements}
                    />
                  </TableHead>
                  <TableHead>{t('inventory.stockMovement.date')}</TableHead>
                  <TableHead>{t('inventory.stockMovement.movementType')}</TableHead>
                  <TableHead>{t('inventory.stockMovement.quantity')}</TableHead>
                  <TableHead>{t('inventory.stockMovement.reason')}</TableHead>
                  <TableHead>{t('inventory.stockMovement.performedBy')}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedMovements.includes(movement.id)}
                        onCheckedChange={() => toggleMovementSelection(movement.id)}
                      />
                    </TableCell>
                    <TableCell>{movement.date}</TableCell>
                    <TableCell>{movement.movementType}</TableCell>
                    <TableCell>{movement.quantity}</TableCell>
                    <TableCell>{movement.reason}</TableCell>
                    <TableCell>{movement.performedBy_id}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openOverlay(movement)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <Pagination 
              currentPage={currentPage} 
              totalPages={pageCount} 
              onPageChange={setCurrentPage} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile View */}
      <div className="md:hidden">
        {movements.map((movement) => (
          <Card key={movement.id} className="mb-4 cursor-pointer w-full" onClick={() => openOverlay(movement)}>
            <CardContent className="flex flex-col p-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Type: {movement.movementType}</span>
                <span className="text-sm text-gray-500">Date: {movement.date}</span>
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-sm text-gray-500">Quantity: {movement.quantity}</p>
                <p className="text-sm text-gray-500">Movement: {movement.movementType}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overlay for additional movement details */}
      {selectedMovement && (
        <Dialog open={!!selectedMovement} onOpenChange={closeOverlay}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Movement Details</DialogTitle>
            </DialogHeader>
            <p><strong>Type:</strong> {selectedMovement.movementType}</p>
            <p><strong>Quantity:</strong> {selectedMovement.quantity}</p>
            <p><strong>Date:</strong> {selectedMovement.date}</p>
            <p><strong>Inbound/Outbound:</strong> {selectedMovement.movementType}</p>
            <p><strong>Reason:</strong> {selectedMovement.reason}</p>
            <p><strong>Performed By:</strong> {selectedMovement.performedBy_id}</p>
            <Button onClick={closeOverlay}>Close</Button>
          </DialogContent>
        </Dialog>
      )}

      {showPhysicalCount && (
        <Dialog open={showPhysicalCount} onOpenChange={setShowPhysicalCount}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Physical Count Entry</DialogTitle>
            </DialogHeader>
            {/* Add physical count form */}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
