
interface Category {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface CategoryTabsProps {
  categories: Category[];
  selectedCategory: string;
  onCategorySelect: (categoryId: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export default function CategoryTabs({ 
  categories, 
  selectedCategory, 
  onCategorySelect,
  searchTerm,
  onSearchChange 
}: CategoryTabsProps) {
  // Agregar categoría "Todos" al inicio
  const allCategories = [
    { id: 'todos', name: 'Todos', display_order: 0, is_active: true },
    ...categories
  ];

  return (
    <div className="bg-white/95 backdrop-blur-md border-b border-gray-100 sticky top-20 z-10 shadow-sm">
      <div className="px-4 py-4 space-y-4">
        {/* Buscador mejorado */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <i className="ri-search-line text-gray-400 text-xl"></i>
          </div>
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-11 py-3.5 border-2 border-gray-200 rounded-[2rem] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-400 bg-gray-50/50 hover:bg-white transition-all duration-300 text-sm font-medium shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center hover:scale-110 transition-transform duration-200"
            >
              <i className="ri-close-circle-fill text-gray-400 text-xl hover:text-gray-600"></i>
            </button>
          )}
        </div>

        {/* Categorías mejoradas */}
        <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2">
          {allCategories.map((category, index) => (
            <button
              key={category.id}
              onClick={() => onCategorySelect(category.id)}
              className={`px-4 py-2.5 rounded-[1.5rem] whitespace-nowrap text-sm font-semibold transition-all duration-300 flex-shrink-0 hover:scale-105 active:scale-95 ${
                selectedCategory === category.id
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-elegant-lg hover:shadow-xl border-2 border-orange-600'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-gray-200 hover:border-orange-300 shadow-sm'
              }`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
