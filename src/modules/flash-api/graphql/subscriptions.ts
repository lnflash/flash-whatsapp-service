export const MY_LN_UPDATES_SUBSCRIPTION = `
  subscription myLnUpdates {
    myUpdates {
      update {
        ... on LnUpdate {
          paymentHash
          status
        }
      }
    }
  }
`;

export const MY_UPDATES_SUBSCRIPTION = `
  subscription myUpdates {
    myUpdates {
      errors {
        message
      }
      update {
        ... on LnUpdate {
          paymentHash
          status
        }
        ... on Price {
          base
          offset
          currencyUnit
        }
      }
    }
  }
`;
