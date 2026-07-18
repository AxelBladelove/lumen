#include <stdio.h>

int main(void) {
    char line[202];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("NO\n");
        return 0;
    }

    int length = 0;

    /* TODO: calcula la longitud de la linea hasta encontrar
       '\n' o '\0'. No incluyas esos caracteres en length. */

    int is_palindrome = 1;

    /* TODO: compara la cadena usando dos indices:
       uno desde el inicio y otro desde length - 1.
       Si encuentras dos caracteres distintos, marca is_palindrome como 0. */

    if (is_palindrome) {
        printf("SI\n");
    } else {
        printf("NO\n");
    }

    return 0;
}
