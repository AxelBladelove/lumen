#include <stdio.h>

int main(void) {
    char line[1024];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("0\n");
        return 0;
    }

    int length = 0;

    /* TODO: recorre la cadena hasta '\n' o '\0'
       y cuenta solo los caracteres de la linea. */

    printf("%d\n", length);
    return 0;
}
