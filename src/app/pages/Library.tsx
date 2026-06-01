import React, { useState } from 'react';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { exerciseDatabase } from '../../data/exercises';
import { Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('all');

  const filteredExercises = exerciseDatabase.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ex.primaryMuscles.some(m => m.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || ex.category === categoryFilter;
    // FIX #8: "limited" filter now works — it was missing from the select options.
    const matchesEquipment = equipmentFilter === 'all' || ex.equipment === equipmentFilter;

    return matchesSearch && matchesCategory && matchesEquipment;
  });

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight pt-2">Exercise Library</h1>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises or muscles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="pull">Pull</SelectItem>
                  <SelectItem value="legs">Legs</SelectItem>
                  <SelectItem value="abs">Abs</SelectItem>
                </SelectContent>
              </Select>

              <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  <SelectItem value="full_gym">Full Gym</SelectItem>
                  {/* FIX #8: was missing — users with "limited" equipment had no filter option */}
                  <SelectItem value="limited">Limited Equipment</SelectItem>
                  <SelectItem value="bodyweight">Bodyweight</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground">
          Showing {filteredExercises.length} exercise{filteredExercises.length !== 1 ? 's' : ''}
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {filteredExercises.map((exercise) => (
            <AccordionItem key={exercise.id} value={exercise.id} className="border-0 bg-card rounded-2xl shadow-md px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex-1 text-left">
                  <div className="font-medium">{exercise.name}</div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs rounded-lg capitalize">
                      {exercise.category}
                    </Badge>
                    <Badge variant="secondary" className="text-xs rounded-lg capitalize">
                      {exercise.difficulty}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium mb-1">Primary Muscles</div>
                    <div className="flex flex-wrap gap-1">
                      {exercise.primaryMuscles.map((muscle) => (
                        <Badge key={muscle} className="text-xs">{muscle}</Badge>
                      ))}
                    </div>
                  </div>

                  {exercise.secondaryMuscles.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-1">Secondary Muscles</div>
                      <div className="flex flex-wrap gap-1">
                        {exercise.secondaryMuscles.map((muscle) => (
                          <Badge key={muscle} variant="secondary" className="text-xs">{muscle}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-sm font-medium mb-2">Instructions</div>
                    <div className="text-sm text-card-foreground whitespace-pre-line bg-muted/50 p-3 rounded-xl">
                      {exercise.instructions}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Equipment: {exercise.equipment.replace('_', ' ')}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {filteredExercises.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No exercises found matching your criteria</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
