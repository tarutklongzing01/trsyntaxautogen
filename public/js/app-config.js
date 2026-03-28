export const APP_CONFIG = {
  brandName: 'TR SYNTAX AUTOGEN SHOP',
  tagline: 'ร้านค้า Digital พร้อมระบบครบจบ ที่นี่ที่เดียว',
  categories: ['ทั้งหมด', 'Gem', 'GPT', 'AI Credits', 'Account', 'Voucher'],
  orderStatuses: ['paid', 'processing', 'completed', 'cancelled'],
  paymentMethods: [
    {
      id: 'promptpay',
      label: 'PromptPay',
      accountName: '',
      accountValue: '',
      description: 'ชำระผ่านพร้อมเพย์'
    },
    {
      id: 'bank',
      label: 'Bank Transfer',
      accountName: '',
      accountValue: '',
      description: 'ชำระผ่านบัญชีธนาคาร'
    },
    {
      id: 'truewallet',
      label: 'TrueWallet',
      accountName: '',
      accountValue: '',
      description: 'ชำระผ่าน TrueWallet'
    }
  ],
  supportChannels: [],
  topupLimits: {
    min: 50,
    max: 50000
  },
  defaultProductImage: './assets/images/products/gem-rush.svg',
  defaultAvatar:
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 240 240%22%3E%3Crect width=%22240%22 height=%22240%22 rx=%2248%22 fill=%22%23091120%22/%3E%3Ccircle cx=%22120%22 cy=%2288%22 r=%2242%22 fill=%22%2355e6d1%22/%3E%3Cpath d=%22M52 196c14-38 42-58 68-58s54 20 68 58%22 fill=%22none%22 stroke=%22%2376a8ff%22 stroke-width=%2220%22 stroke-linecap=%22round%22/%3E%3C/svg%3E'
};
