import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../../components/base/Button';
import LoadingSpinner from '../../components/base/LoadingSpinner';
import { ordersApi } from '../../lib/api';
import CheckoutConfirmation from './components/CheckoutConfirmation';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions?: any;
  optionsText?: string[];
}

type DeliveryType = 'delivery' | 'pickup';

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, total } = location.state || { cart: [], total: 0 };
  
  const [step, setStep] = useState(1);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    deliveryType: 'delivery' as DeliveryType,
    street: '',
    streetNumber: '',
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');

  // Dirección de retiro (configurable)
  const PICKUP_ADDRESS = 'Av. RIVADAVIA 2911';
  const PICKUP_HOURS = 'Lunes a Domingo de 18:00 a 00:00';

  useEffect(() => {
    if (!cart || cart.length === 0) {
      navigate('/menu');
    }
  }, [cart, navigate]);

  const validateStep = (currentStep: number) => {
    const errors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!customerInfo.name.trim()) {
        errors.name = 'El nombre es obligatorio';
      }
    }
    
    if (currentStep === 2) {
      if (customerInfo.deliveryType === 'delivery') {
        if (!customerInfo.street.trim()) {
          errors.street = 'La calle es obligatoria';
        }
        if (!customerInfo.streetNumber.trim()) {
          errors.streetNumber = 'El número es obligatorio';
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(step)) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Construir dirección completa
      const fullAddress = customerInfo.deliveryType === 'delivery'
        ? `${customerInfo.street} ${customerInfo.streetNumber}`
        : PICKUP_ADDRESS;

      // Crear el pedido en la base de datos
      const orderItems = cart.map((item: CartItem) => {
        // Parsear selectedOptions correctamente
        let selectedOptionsData = {};
        if (item.selectedOptions) {
          // Si selectedOptions tiene la estructura { selectedOptions: [...], ... }
          if (item.selectedOptions.selectedOptions && Array.isArray(item.selectedOptions.selectedOptions)) {
            // Guardar el array completo de opciones seleccionadas
            selectedOptionsData = {
              options: item.selectedOptions.selectedOptions.map((opt: any) => ({
                id: opt.id,
                name: opt.name,
                price: opt.price || 0,
                category_id: opt.category_id || opt.categoryId
              })),
              optionsText: item.selectedOptions.optionsText || []
            };
          } else if (Array.isArray(item.selectedOptions)) {
            // Si ya es un array directo
            selectedOptionsData = {
              options: item.selectedOptions.map((opt: any) => ({
                id: opt.id,
                name: opt.name,
                price: opt.price || 0,
                category_id: opt.category_id || opt.categoryId
              }))
            };
          } else {
            // Si es un objeto con estructura {categoryId: [options]}
            selectedOptionsData = item.selectedOptions;
          }
        }
        
        return {
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          subtotal: item.price * item.quantity,
          selected_options: JSON.stringify(selectedOptionsData)
        };
      });

      const orderData = {
        customer_name: customerInfo.name,
        customer_phone: '', // Se obtendrá desde WhatsApp
        customer_address: fullAddress,
        status: 'pending',
        payment_method: null, // Se elegirá en WhatsApp
        payment_status: 'pending',
        subtotal: total,
        delivery_fee: customerInfo.deliveryType === 'delivery' ? 3500 : 0,
        total: total + (customerInfo.deliveryType === 'delivery' ? 3500 : 0),
        notes: `${customerInfo.deliveryType === 'pickup' ? 'RETIRO EN LOCAL - ' : ''}${customerInfo.notes || ''}`.trim()
      };

      // Crear pedido en la base de datos
      const createdOrder = await ordersApi.create({
        ...orderData,
        items: orderItems
      });
      
      if (!createdOrder || !createdOrder.id) {
        throw new Error('No se pudo crear el pedido');
      }

      const finalOrderNumber = createdOrder.order_number || `#${createdOrder.id.slice(0, 8)}`;
      setOrderNumber(finalOrderNumber);
      
      // Obtener código único del pedido
      const uniqueCode = createdOrder.unique_code || createdOrder.uniqueCode;
      
      if (!uniqueCode) {
        console.warn('⚠️ El pedido no tiene código único asignado');
        console.warn('📦 Respuesta completa del pedido:', createdOrder);
      } else {
        console.log(`✅ Código único recibido: ${uniqueCode}`);
      }
      
      // Mensaje con formato: PEDIDO CONFIRMADO - XXXX - El Buen Menú Código de pedido: #XXXX
      const mensaje = uniqueCode 
        ? `PEDIDO CONFIRMADO - ${uniqueCode} - El Buen Menú

Código de pedido: ${finalOrderNumber}`
        : `PEDIDO CONFIRMADO - El Buen Menú

Código de pedido: ${finalOrderNumber}`;

      const mensajeCodificado = encodeURIComponent(mensaje);
      const whatsappNumber = '5493487207406';
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${mensajeCodificado}`;
      
      // Guardar la URL de WhatsApp en el estado para el paso 4
      setWhatsappUrl(whatsappUrl);
      
      // Ir al paso de confirmación con animación de carga
      setStep(4);

    } catch (error: any) {
      console.error('Error al crear pedido:', error);
      console.error('Error details:', error?.details);
      console.error('Error status:', error?.status);
      
      // Mostrar mensaje de error más detallado
      const errorMessage = error?.message || 'Hubo un error al crear el pedido. Por favor, intenta nuevamente.';
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!cart || cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner text="Redirigiendo..." />
      </div>
    );
  }

  // Paso 1: Nombre
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-4 py-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate('/menu')}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-line text-gray-600"></i>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Paso 1 de 3</h1>
                <p className="text-xs text-gray-500">Datos del cliente</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 pb-20">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center">
              <i className="ri-user-line text-blue-500 mr-2"></i>
              ¿Cuál es tu nombre?
            </h2>
            
            <input
              type="text"
              value={customerInfo.name}
              onChange={(e) => {
                setCustomerInfo({...customerInfo, name: e.target.value});
                if (validationErrors.name) {
                  setValidationErrors({...validationErrors, name: ''});
                }
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors text-lg ${
                validationErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Tu nombre completo"
              autoFocus
            />
            {validationErrors.name && (
              <p className="mt-2 text-sm text-red-600">{validationErrors.name}</p>
            )}
          </div>

          <Button
            onClick={handleNext}
            variant="primary"
            size="lg"
            disabled={!customerInfo.name.trim()}
            className="w-full"
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  // Paso 2: Tipo de entrega y dirección
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-4 py-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-line text-gray-600"></i>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Paso 2 de 3</h1>
                <p className="text-xs text-gray-500">Tipo de entrega</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 pb-20">
          {/* Tipo de entrega */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center">
              <i className="ri-truck-line text-green-500 mr-2"></i>
              ¿Cómo querés recibir tu pedido?
            </h2>
            
            <div className="space-y-3 mb-6">
              <label
                className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${
                  customerInfo.deliveryType === 'delivery'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryType"
                  value="delivery"
                  checked={customerInfo.deliveryType === 'delivery'}
                  onChange={(e) => setCustomerInfo({...customerInfo, deliveryType: e.target.value as DeliveryType})}
                  className="sr-only"
                />
                <i className={`ri-truck-line text-2xl mr-3 ${
                  customerInfo.deliveryType === 'delivery' ? 'text-orange-500' : 'text-gray-400'
                }`}></i>
                <div className="flex-1">
                  <span className={`font-medium block ${
                    customerInfo.deliveryType === 'delivery' ? 'text-orange-700' : 'text-gray-700'
                  }`}>
                    Envío a domicilio
                  </span>
                  <span className="text-xs text-gray-500">Costo de envío: $3.500</span>
                </div>
              </label>

              <label
                className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${
                  customerInfo.deliveryType === 'pickup'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryType"
                  value="pickup"
                  checked={customerInfo.deliveryType === 'pickup'}
                  onChange={(e) => setCustomerInfo({...customerInfo, deliveryType: e.target.value as DeliveryType})}
                  className="sr-only"
                />
                <i className={`ri-store-line text-2xl mr-3 ${
                  customerInfo.deliveryType === 'pickup' ? 'text-orange-500' : 'text-gray-400'
                }`}></i>
                <div className="flex-1">
                  <span className={`font-medium block ${
                    customerInfo.deliveryType === 'pickup' ? 'text-orange-700' : 'text-gray-700'
                  }`}>
                    Retiro en local
                  </span>
                  <span className="text-xs text-gray-500">Sin costo adicional</span>
                </div>
              </label>
            </div>

            {/* Si es envío, pedir dirección */}
            {customerInfo.deliveryType === 'delivery' && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Calle *
                  </label>
                  <input
                    type="text"
                    value={customerInfo.street}
                    onChange={(e) => {
                      setCustomerInfo({...customerInfo, street: e.target.value});
                      if (validationErrors.street) {
                        setValidationErrors({...validationErrors, street: ''});
                      }
                    }}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                      validationErrors.street ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Nombre de la calle"
                  />
                  {validationErrors.street && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.street}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número *
                  </label>
                  <input
                    type="text"
                    value={customerInfo.streetNumber}
                    onChange={(e) => {
                      setCustomerInfo({...customerInfo, streetNumber: e.target.value});
                      if (validationErrors.streetNumber) {
                        setValidationErrors({...validationErrors, streetNumber: ''});
                      }
                    }}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                      validationErrors.streetNumber ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Número de casa"
                  />
                  {validationErrors.streetNumber && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.streetNumber}</p>
                  )}
                </div>
              </div>
            )}

            {/* Si es retiro, mostrar información */}
            {customerInfo.deliveryType === 'pickup' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
                <div className="flex items-start space-x-3">
                  <i className="ri-information-line text-blue-600 text-xl mt-1"></i>
                  <div>
                    <p className="font-medium text-blue-800 mb-1">Retiro en local</p>
                    <p className="text-sm text-blue-700 mb-2">{PICKUP_ADDRESS}</p>
                    <p className="text-sm text-blue-700">⏰ Horarios: {PICKUP_HOURS}</p>
                    <p className="text-xs text-blue-600 mt-2">El administrador te avisará por WhatsApp cuando tu pedido esté listo para retirar.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Notas opcionales */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas adicionales (opcional)
              </label>
              <textarea
                value={customerInfo.notes}
                onChange={(e) => setCustomerInfo({...customerInfo, notes: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                placeholder="Aclaraciones sobre el pedido, la entrega, alergias, etc."
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          <Button
            onClick={handleNext}
            variant="primary"
            size="lg"
            className="w-full"
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  // Paso 3: Confirmación
  if (step === 3) {
    const fullAddress = customerInfo.deliveryType === 'delivery'
      ? `${customerInfo.street} ${customerInfo.streetNumber}`
      : PICKUP_ADDRESS;
    
    const finalTotal = total + (customerInfo.deliveryType === 'delivery' ? 3500 : 0);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-4 py-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-line text-gray-600"></i>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Paso 3 de 3</h1>
                <p className="text-xs text-gray-500">Confirmar pedido</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 pb-20">
          {/* Resumen del pedido */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center">
              <i className="ri-shopping-cart-line text-red-500 mr-2"></i>
              Resumen del Pedido
            </h2>
            
            <div className="space-y-3 mb-4">
              {cart.map((item: CartItem) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
                        {item.quantity}x
                      </span>
                      <span className="font-medium text-gray-800">{item.name}</span>
                    </div>
                    
                    {item.optionsText && item.optionsText.length > 0 && (
                      <div className="mt-1 ml-8">
                        {item.optionsText.map((option, index) => (
                          <p key={index} className="text-xs text-gray-500">+ {option}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <span className="font-bold text-gray-800">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="border-t border-gray-200 pt-3 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal:</span>
                <span>{formatPrice(total)}</span>
              </div>
              {customerInfo.deliveryType === 'delivery' && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Envío:</span>
                  <span>{formatPrice(3500)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="font-bold text-lg text-gray-800">Total:</span>
                <span className="font-bold text-xl text-red-600">{formatPrice(finalTotal)}</span>
              </div>
            </div>
          </div>

          {/* Datos del cliente */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center">
              <i className="ri-user-line text-blue-500 mr-2"></i>
              Tus Datos
            </h2>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Nombre:</span>
                <span className="font-medium text-gray-800">{customerInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tipo:</span>
                <span className="font-medium text-gray-800">
                  {customerInfo.deliveryType === 'delivery' ? '🚚 Envío a domicilio' : '🏪 Retiro en local'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {customerInfo.deliveryType === 'delivery' ? 'Dirección:' : 'Dirección de retiro:'}
                </span>
                <span className="font-medium text-gray-800 text-right max-w-[60%]">{fullAddress}</span>
              </div>
              {customerInfo.notes && (
                <div className="pt-2 border-t">
                  <span className="text-gray-600">Notas:</span>
                  <p className="text-gray-800 mt-1">{customerInfo.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Información de WhatsApp */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 mb-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="ri-whatsapp-fill text-green-600 text-xl"></i>
              </div>
              <div>
                <h3 className="font-bold text-green-800 mb-2">¿Qué sigue?</h3>
                <div className="space-y-2 text-sm text-green-700">
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-green-600"></i>
                    <span>Te redirigiremos a WhatsApp con tu número de pedido</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-green-600"></i>
                    <span>El bot verificará tu pedido y te preguntará si está todo bien</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-green-600"></i>
                    <span>Elegirás el método de pago y confirmarás</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              disabled={isSubmitting}
              icon="ri-whatsapp-fill"
              className="w-full"
            >
              {isSubmitting ? 'Creando Pedido...' : 'Confirmar y Continuar por WhatsApp'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Paso 4: Confirmación final (después de crear el pedido) con animación
  if (step === 4) {
    return (
      <CheckoutConfirmation 
        orderNumber={orderNumber || ''} 
        whatsappUrl={whatsappUrl || ''}
        onBackToMenu={() => navigate('/menu')}
      />
    );
  }

  return null;
}
