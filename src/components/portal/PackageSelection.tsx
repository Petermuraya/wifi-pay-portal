
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Zap } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];

interface PackageSelectionProps {
  packages: AccessPackage[];
  onSelectPackage: (pkg: AccessPackage) => void;
}

export function PackageSelection({ packages, onSelectPackage }: PackageSelectionProps) {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
  };

  const getPopularPackage = () => {
    // Mark the 3-hour package as popular for demo
    return packages.find(pkg => pkg.duration_minutes === 180)?.id;
  };

  const getIcon = (duration: number) => {
    if (duration <= 60) return <Clock className="h-6 w-6" />;
    if (duration <= 180) return <Users className="h-6 w-6" />;
    return <Zap className="h-6 w-6" />;
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Choose Your Internet Package</CardTitle>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {packages.map((pkg) => (
          <Card 
            key={pkg.id} 
            className={`relative transition-all hover:shadow-lg ${
              pkg.id === getPopularPackage() ? 'ring-2 ring-indigo-500' : ''
            }`}
          >
            {pkg.id === getPopularPackage() && (
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-indigo-600">
                Popular
              </Badge>
            )}
            
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center text-indigo-600 mb-2">
                {getIcon(pkg.duration_minutes)}
              </div>
              <CardTitle className="text-lg">{pkg.name}</CardTitle>
              <div className="text-2xl font-bold text-gray-900">
                KSh {pkg.price}
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-4 w-4 mr-2" />
                  {formatDuration(pkg.duration_minutes)}
                </div>
                {pkg.description && (
                  <p className="text-sm text-gray-600">{pkg.description}</p>
                )}
              </div>
              
              <Button 
                onClick={() => onSelectPackage(pkg)}
                className="w-full"
                variant={pkg.id === getPopularPackage() ? "default" : "outline"}
              >
                Select Package
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>1. Select your preferred internet package</p>
              <p>2. Enter your M-Pesa phone number</p>
              <p>3. Complete payment via M-Pesa</p>
              <p>4. Get instant internet access!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
